import { GetCommand } from '@aws-sdk/lib-dynamodb'
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

async function countVotes(
  account: string,
  vaultAddress: string,
  resetVersion: number,
  activeChoicePoint?: string  // "universe:chapter:cp" — excluded until chapter closes
): Promise<number> {
  const [activeUniverse, activeChapter, activeCp] = (activeChoicePoint ?? '').split(':')
  const res = await fetch(XRPL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'account_tx',
      params: [{ account: vaultAddress, limit: 200, forward: false }],
    }),
  })

  const data = await res.json()
  const transactions: unknown[] = data.result?.transactions ?? []
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
    let winners = 0
    let participation = 0
    const wTaxon = winnerTaxon(resetVersion)
    const pTaxon = participationTaxon(resetVersion)
    for (const nft of nfts) {
      const n = nft as Record<string, unknown>
      if (n.Issuer !== vaultAddress) continue
      if (n.NFTokenTaxon === wTaxon) winners++
      else if (n.NFTokenTaxon === pTaxon) participation++
    }
    return { winners, participation }
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
  vaultAddress: string
): Promise<ResonanceBreakdown> {
  const [resetVersion, configItem] = await Promise.all([
    getResetVersion(),
    dynamo.send(new GetCommand({ TableName: 'eigenthrope_config', Key: { key: 'active_choice_point' } })),
  ])
  const activeChoicePoint = configItem.Item?.value as string | undefined
  const [votes, { winners, participation }] = await Promise.all([
    countVotes(account, vaultAddress, resetVersion, activeChoicePoint),
    countArtifacts(account, vaultAddress, resetVersion),
  ])
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
