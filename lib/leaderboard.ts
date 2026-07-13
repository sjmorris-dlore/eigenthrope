import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from './dynamo'
import { getResetVersion } from './config'
import { fetchVaultTransactions, getResonanceBreakdown, type ResonanceBreakdown } from './resonance'
import {
  buildChapterWeightsIndex, profileFromChoices, signatureGlyphPoints,
  walletChoicesFromTransactions,
} from './signature'

// Clio server — supports nft_info (current owner lookup), which xrplcluster doesn't
const CLIO_RPC = 'https://s2.ripple.com:51234/'

export interface LeaderboardEntry extends ResonanceBreakdown {
  account: string
  /** Player-chosen public display name (opt-in via the wallet page) */
  alias?: string
  /** Set for the game's own observer bots — displayed by name with a badge */
  bot_name?: string
  /** Resonance signature — SVG polygon points, the profile's only public projection */
  glyph: string
}

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

/** Every address that has cast a well-formed vote at the current reset version. */
function getVoterAccounts(transactions: unknown[], resetVersion: number): string[] {
  const voters = new Set<string>()
  for (const entry of transactions) {
    const e = entry as { tx_json?: Record<string, unknown>; tx?: Record<string, unknown> }
    const tx = e.tx_json ?? e.tx
    if (!tx || tx.TransactionType !== 'Payment') continue
    const sender = (tx.Account as string)?.trim()
    if (!sender || voters.has(sender)) continue
    const memos = tx.Memos as Array<{ Memo?: { MemoData?: string } }> | undefined
    for (const { Memo } of memos ?? []) {
      if (!Memo?.MemoData) continue
      try {
        const vote = JSON.parse(fromHex(Memo.MemoData))
        if (vote.universe && vote.chapter && vote.choice_point && (vote.rv ?? 0) === resetVersion) {
          voters.add(sender)
          break
        }
      } catch { /* malformed memo */ }
    }
  }
  return [...voters]
}

/**
 * Current owners of every minted artifact — so buying an artifact puts you
 * on the board even before your first vote. Sequential and best-effort:
 * a failed lookup just means that holder is missing until they vote.
 */
async function getArtifactHolders(): Promise<Set<string>> {
  const holders = new Set<string>()
  try {
    const scan = await dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_minting',
      ProjectionExpression: 'nft_token_id',
    }))
    for (const item of scan.Items ?? []) {
      const nftId = item.nft_token_id as string
      try {
        const res = await fetch(CLIO_RPC, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'nft_info', params: [{ nft_id: nftId }] }),
        })
        const data = await res.json()
        const owner = data.result?.owner as string | undefined
        if (owner && !data.result?.is_burned) holders.add(owner)
      } catch { /* best-effort */ }
    }
  } catch { /* best-effort */ }
  return holders
}

/** All opt-in aliases, keyed by account. Stored as alias:<account> config items. */
export async function getAliases(): Promise<Map<string, string>> {
  const aliases = new Map<string, string>()
  try {
    const res = await dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_config',
      FilterExpression: 'begins_with(#k, :prefix)',
      ExpressionAttributeNames: { '#k': 'key' },
      ExpressionAttributeValues: { ':prefix': 'alias:' },
    }))
    for (const item of res.Items ?? []) {
      const key = item.key as string
      const value = item.value
      if (typeof value === 'string' && value.trim()) {
        aliases.set(key.slice('alias:'.length), value.trim())
      }
    }
  } catch { /* aliases are cosmetic — never fail the board */ }
  return aliases
}

export async function getLeaderboard(vaultAddress: string): Promise<LeaderboardEntry[]> {
  const [botAddressMap, aliases] = await Promise.all([
    getBotAddressNameMap(),
    getAliases(),
  ])

  const resetVersion = await getResetVersion()

  // ONE vault tx fetch feeds both the voter list and every vote count —
  // parallel per-account refetches previously tripped the XRPL cluster's
  // rate limit, which crashed the page.
  const vaultTransactions = await fetchVaultTransactions(vaultAddress, 400)
  const accounts = getVoterAccounts(vaultTransactions, resetVersion)
  // Bots belong on the board even in a round where they haven't voted yet,
  // and so does anyone holding an artifact — buying standing counts.
  const holders = await getArtifactHolders()
  for (const addr of [...botAddressMap.keys(), ...holders]) {
    if (addr !== vaultAddress && !accounts.includes(addr)) accounts.push(addr)
  }

  // Resonance signatures: fold each wallet's vote history into its hidden
  // behavioral profile server-side; only the star's coordinates leave here.
  const chapterScan = await dynamo.send(new ScanCommand({
    TableName: 'eigenthrope_chapters',
    ProjectionExpression: 'choice_point, universe, chapter, choices',
  }))
  const weightsIndex = buildChapterWeightsIndex(
    (chapterScan.Items ?? []) as Parameters<typeof buildChapterWeightsIndex>[0]
  )
  const walletChoices = walletChoicesFromTransactions(vaultTransactions, resetVersion)

  // Sequential on purpose: each account still needs its own account_nfts call
  const entries: LeaderboardEntry[] = []
  for (const account of accounts) {
    const breakdown = await getResonanceBreakdown(account, vaultAddress, vaultTransactions)
    entries.push({
      account,
      ...breakdown,
      alias: aliases.get(account),
      bot_name: botAddressMap.get(account),
      glyph: signatureGlyphPoints(profileFromChoices(walletChoices.get(account), weightsIndex)),
    })
  }

  return entries.sort((a, b) => b.resonance - a.resonance || a.account.localeCompare(b.account))
}

/** address → bot name, inverted from the bot_addresses config map. */
async function getBotAddressNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const res = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'bot_addresses' },
    }))
    const value = res.Item?.value as Record<string, string> | undefined
    for (const [name, address] of Object.entries(value ?? {})) {
      if (typeof address === 'string') map.set(address, name)
    }
  } catch { /* badges are cosmetic */ }
  return map
}
