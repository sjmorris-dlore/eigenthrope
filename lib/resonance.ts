import { BatchGetCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from './dynamo'
import { getResetVersion } from './config'

const XRPL_RPC = 'https://xrplcluster.com/'

export const WINNER_TAXON_BASE = 1000
export const PARTICIPATION_TAXON_BASE = 2000
export const WINNER_BONUS = 5
export const PARTICIPATION_BONUS = 1

export function winnerTaxon(rv: number)        { return WINNER_TAXON_BASE + rv }
export function participationTaxon(rv: number) { return PARTICIPATION_TAXON_BASE + rv }

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

/** Fetch the vault's recent transactions — the shared input for vote counting. */
export async function fetchVaultTransactions(vaultAddress: string, limit = 200): Promise<unknown[]> {
  try {
    const res = await fetch(XRPL_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_tx',
        params: [{ account: vaultAddress, limit, forward: false }],
      }),
    })
    const data = await res.json() // throws on rate-limit plain-text responses
    return (data.result?.transactions ?? []) as unknown[]
  } catch {
    return []
  }
}

/** Count an account's completed-chapter votes from an already-fetched tx list. */
export function countVotesFromTransactions(
  transactions: unknown[],
  account: string,
  resetVersion: number,
  activeChoicePoint?: string  // "universe:chapter:cp" — excluded until chapter closes
): number {
  const [activeUniverse, activeChapter, activeCp] = (activeChoicePoint ?? '').split(':')
  const participated = new Set<string>()
  const seenAccounts = new Set<string>()

  for (const entry of transactions) {
    const tx = (entry as Record<string, unknown>).tx_json ??
                (entry as Record<string, unknown>).tx
    if (!tx) continue
    const t = tx as Record<string, unknown>
    if (t.TransactionType !== 'Payment') continue
    const sender = (t.Account as string)?.trim()
    if (!sender) continue

    const memos = t.Memos as Array<{ Memo: { MemoData?: string } }> | undefined
    if (!memos) continue

    for (const { Memo } of memos) {
      if (!Memo.MemoData) continue
      try {
        const vote = JSON.parse(fromHex(Memo.MemoData))
        const isActiveChapter =
          vote.universe === activeUniverse &&
          vote.chapter === activeChapter &&
          vote.choice_point === activeCp
        if (
          vote.universe && vote.chapter && vote.choice_point &&
          (vote.rv ?? 0) === resetVersion &&
          !isActiveChapter &&
          sender === account &&
          !seenAccounts.has(`${sender}:${vote.universe}:${vote.chapter}:${vote.choice_point}`)
        ) {
          participated.add(`${vote.universe}:${vote.chapter}:${vote.choice_point}`)
          seenAccounts.add(`${sender}:${vote.universe}:${vote.chapter}:${vote.choice_point}`)
        }
      } catch { /* skip malformed */ }
    }
  }

  return participated.size
}

/**
 * Which chapter (and type) an NFT belongs to, for dedupe: the mint Lambda
 * records every token in eigenthrope_minting. Missing records fall back to
 * the token's URI (chapter artifacts share their chapter's URI), then to the
 * token id itself (no dedupe — counts individually).
 */
async function artifactIdentities(tokenIds: string[]): Promise<Map<string, string>> {
  const identities = new Map<string, string>()
  for (let i = 0; i < tokenIds.length; i += 100) {
    const chunk = tokenIds.slice(i, i + 100)
    try {
      const res = await dynamo.send(new BatchGetCommand({
        RequestItems: {
          eigenthrope_minting: {
            Keys: chunk.map(id => ({ nft_token_id: id })),
            ProjectionExpression: 'nft_token_id, choice_point, artifact_type',
          },
        },
      }))
      for (const item of res.Responses?.eigenthrope_minting ?? []) {
        const rec = item as { nft_token_id: string; choice_point?: string; artifact_type?: string }
        if (rec.choice_point && rec.artifact_type) {
          identities.set(rec.nft_token_id, `${rec.choice_point}#${rec.artifact_type}`)
        }
      }
    } catch { /* fall back to URI/token-id keys below */ }
  }
  return identities
}

async function countArtifacts(
  account: string,
  vaultAddress: string,
  resetVersion: number
): Promise<{ winners: number; participation: number }> {
  try {
    const res = await fetch(XRPL_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_nfts',
        params: [{ account, limit: 400 }],
      }),
    })
    const data = await res.json()
    const nfts: unknown[] = data.result?.account_nfts ?? []
    const wTaxon = winnerTaxon(resetVersion)
    const pTaxon = participationTaxon(resetVersion)

    const matched: { id: string; uri?: string; type: 'winner' | 'participation' }[] = []
    for (const nft of nfts) {
      const n = nft as Record<string, unknown>
      if (n.Issuer !== vaultAddress) continue
      if (n.NFTokenTaxon === wTaxon) matched.push({ id: n.NFTokenID as string, uri: n.URI as string | undefined, type: 'winner' })
      else if (n.NFTokenTaxon === pTaxon) matched.push({ id: n.NFTokenID as string, uri: n.URI as string | undefined, type: 'participation' })
    }
    if (matched.length === 0) return { winners: 0, participation: 0 }

    // Duplicates of the same chapter's artifact score once: resonance counts
    // distinct (chapter, type) pairs held, however they were acquired.
    const identities = await artifactIdentities(matched.map(m => m.id))
    const winnerSet = new Set<string>()
    const participationSet = new Set<string>()
    for (const m of matched) {
      const key = identities.get(m.id) ?? (m.uri ? `uri:${m.uri}#${m.type}` : `token:${m.id}`)
      if (m.type === 'winner') winnerSet.add(key)
      else participationSet.add(key)
    }
    return { winners: winnerSet.size, participation: participationSet.size }
  } catch {
    return { winners: 0, participation: 0 }
  }
}

export interface ResonanceBreakdown {
  votes: number
  artifacts: number
  winner_artifacts: number
  participation_artifacts: number
  resonance: number
  reset_version: number
}

export async function getResonanceBreakdown(
  account: string,
  vaultAddress: string,
  /** Reuse an already-fetched vault tx list — callers scoring many accounts
   *  (the leaderboard) must pass this to avoid hammering the XRPL cluster. */
  vaultTransactions?: unknown[],
): Promise<ResonanceBreakdown> {
  const [resetVersion, configItem] = await Promise.all([
    getResetVersion(),
    dynamo.send(new GetCommand({ TableName: 'eigenthrope_config', Key: { key: 'active_choice_point' } })),
  ])
  const activeChoicePoint = configItem.Item?.value as string | undefined
  const transactions = vaultTransactions ?? await fetchVaultTransactions(vaultAddress)
  const votes = countVotesFromTransactions(transactions, account, resetVersion, activeChoicePoint)
  const { winners, participation } = await countArtifacts(account, vaultAddress, resetVersion)
  return {
    votes,
    winner_artifacts: winners,
    participation_artifacts: participation,
    artifacts: winners + participation,
    resonance: votes + 1 + winners * WINNER_BONUS + participation * PARTICIPATION_BONUS,
    reset_version: resetVersion,
  }
}

export async function getResonance(
  account: string,
  vaultAddress: string
): Promise<number> {
  const { resonance } = await getResonanceBreakdown(account, vaultAddress)
  return resonance
}

/**
 * Live weights for a set of voters, computed from what each holds RIGHT NOW.
 * This is what makes artifact transfers matter until a chapter closes — and
 * what stops one artifact from boosting several votes in the same round
 * (at close it sits in exactly one wallet). Sequential per account; pass the
 * shared vault tx list to keep the XRPL cluster happy.
 */
export async function getLiveWeights(
  accounts: string[],
  vaultAddress: string,
  vaultTransactions?: unknown[],
): Promise<Record<string, number>> {
  const transactions = vaultTransactions ?? await fetchVaultTransactions(vaultAddress)
  const weights: Record<string, number> = {}
  for (const account of accounts) {
    try {
      const { resonance } = await getResonanceBreakdown(account, vaultAddress, transactions)
      weights[account] = resonance
    } catch {
      weights[account] = 1 // never let one bad lookup zero out a voter
    }
  }
  return weights
}
