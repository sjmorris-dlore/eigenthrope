import { Client, Wallet, type Payment } from 'xrpl'
import { fetchWalletSeed } from './aws.js'
import { SITE_URL, SOURCE_TAG, XRPL_WSS, vaultAddress } from './config.js'
import { walletSecretEnvVar, type CharacterDef } from './characters.js'
import type { GameContext } from './story.js'

function toHex(s: string): string {
  return Buffer.from(s, 'utf8').toString('hex').toUpperCase()
}

export interface VoteResult {
  hash: string
  engineResult: string
}

export async function loadWallet(character: CharacterDef): Promise<Wallet> {
  const envVar = walletSecretEnvVar(character.name)
  const secretName = process.env[envVar]?.trim()
  if (!secretName) throw new Error(`Missing env var ${envVar}`)
  const seed = await fetchWalletSeed(secretName)
  return Wallet.fromSeed(seed)
}

/**
 * Startup check: fetch the seed from Secrets Manager and derive the address,
 * without submitting anything. Surfaces a bad secret/permission at boot
 * instead of during the first live vote. Returns the derived address so it
 * can be compared against the funded wallet in Xaman.
 */
export async function preflightWallet(character: CharacterDef): Promise<string> {
  const wallet = await loadWallet(character)
  return wallet.classicAddress
}

/**
 * Live vote weight: the bot's resonance, computed by the site's public API —
 * the same formula players get (votes + 1 + winner NFTs × 5 + participation
 * NFTs × 1). Falls back to the character's static weight if the API is
 * unreachable, so a site outage can't block a vote.
 */
async function fetchVoteWeight(character: CharacterDef, address: string): Promise<number> {
  try {
    const res = await fetch(`${SITE_URL}/api/resonance?account=${encodeURIComponent(address)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { resonance?: number }
    if (typeof data.resonance === 'number' && data.resonance >= 1) return data.resonance
    throw new Error('malformed resonance response')
  } catch (err) {
    console.warn(`[xrpl] ${character.name}: resonance lookup failed (${err instanceof Error ? err.message : err}) — using fallback weight ${character.weight}`)
    return character.weight
  }
}

/**
 * Submit a 1-drop vote Payment from the character's wallet to the vault.
 * Memo format mirrors the site's player votes exactly.
 */
export async function submitVote(
  character: CharacterDef,
  game: GameContext,
  choice: string,
): Promise<VoteResult> {
  const wallet = await loadWallet(character)
  const weight = await fetchVoteWeight(character, wallet.classicAddress)

  const memoData = JSON.stringify({
    universe: game.universe,
    chapter: game.chapter,
    choice_point: game.cp,
    choice,
    weight,
    rv: game.resetVersion,
  })

  const tx: Payment = {
    TransactionType: 'Payment',
    Account: wallet.classicAddress,
    Destination: vaultAddress(),
    Amount: '1', // 1 drop
    SourceTag: SOURCE_TAG,
    Memos: [{
      Memo: {
        MemoType: toHex('eigenthrope/vote'),
        MemoData: toHex(memoData),
      },
    }],
  }

  console.log(`[xrpl] ${character.name}: submitting vote "${choice}" from ${wallet.classicAddress} → ${vaultAddress()} (rv=${game.resetVersion}, weight=${weight})`)
  const client = new Client(XRPL_WSS)
  await client.connect()
  try {
    const prepared = await client.autofill(tx)
    const signed = wallet.sign(prepared)
    const result = await client.submitAndWait(signed.tx_blob)
    const engineResult = typeof result.result.meta === 'object' && result.result.meta !== null
      ? (result.result.meta as { TransactionResult?: string }).TransactionResult ?? 'unknown'
      : 'unknown'
    if (engineResult !== 'tesSUCCESS') {
      throw new Error(`[xrpl] vote tx failed: ${engineResult} (${result.result.hash})`)
    }
    return { hash: result.result.hash, engineResult }
  } finally {
    await client.disconnect()
  }
}
