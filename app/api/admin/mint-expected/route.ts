import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion } from '@/lib/config'
import type { ChapterData } from '@/app/api/chapter/route'

const XRPL_RPC = 'https://xrplcluster.com/'

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const choicePoint = url.searchParams.get('choice_point')
  if (!choicePoint) return Response.json({ error: 'choice_point required' }, { status: 400 })

  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
  if (!vaultAddress) return Response.json({ error: 'EIGENTHROPE_VAULT_ADDRESS not set' }, { status: 500 })

  const [chapterItem, resetVersion] = await Promise.all([
    dynamo.send(new GetCommand({ TableName: 'eigenthrope_chapters', Key: { choice_point: choicePoint } })),
    getResetVersion(),
  ])

  const chapter = chapterItem.Item as ChapterData | undefined
  if (!chapter) return Response.json({ error: 'Chapter not found' }, { status: 404 })

  // Use stored fields, not key segments — they may differ after migrations (e.g. "C01" vs "E01").
  const [, , cp] = choicePoint.split(':')
  const universe = chapter.universe
  const chapterSeg = chapter.chapter
  const finalYieldPct = chapter.final_yield_pct ?? 0.18
  const winningChoice = chapter.winning_choice ?? null

  // Fetch account_tx from XRPL via HTTP JSON-RPC
  const rpcRes = await fetch(XRPL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'account_tx',
      params: [{ account: vaultAddress, limit: 400, forward: false }],
    }),
  })
  if (!rpcRes.ok) return Response.json({ error: 'XRPL RPC error' }, { status: 502 })
  const rpcData = await rpcRes.json() as { result: { transactions: unknown[] } }

  // Count unique voters for this choice_point + reset_version (same logic as mint-nfts Lambda)
  const allVoters: Record<string, string> = {} // address → choice
  const seen = new Set<string>()

  for (const entry of rpcData.result.transactions ?? []) {
    const e = entry as { tx_json?: Record<string, unknown>; tx?: Record<string, unknown> }
    const tx = e.tx_json ?? e.tx
    if (!tx || tx['TransactionType'] !== 'Payment') continue
    const sender = (tx['Account'] as string)?.trim()
    if (!sender || seen.has(sender)) continue

    const memos = tx['Memos'] as Array<{ Memo?: { MemoData?: string } }> | undefined
    for (const { Memo } of memos ?? []) {
      if (!Memo?.MemoData) continue
      try {
        const vote = JSON.parse(fromHex(Memo.MemoData)) as {
          universe?: string; chapter?: string; choice_point?: string; choice?: string; rv?: number
        }
        if (
          vote.universe === universe &&
          vote.chapter === chapterSeg &&
          vote.choice_point === cp &&
          (vote.rv ?? 0) === resetVersion
        ) {
          allVoters[sender] = vote.choice ?? ''
          seen.add(sender)
        }
      } catch { /* malformed memo */ }
    }
  }

  const uniqueVoters = Object.keys(allVoters).length
  const winningVotersCount = winningChoice
    ? Object.values(allVoters).filter(c => c === winningChoice).length
    : 0
  const winnerTierSize = winningChoice
    ? Math.max(1, Math.ceil(winningVotersCount * finalYieldPct))
    : 0
  const expectedMints = uniqueVoters + winnerTierSize // participation for all + winner for tier

  return Response.json({
    unique_voters: uniqueVoters,
    winner_tier: winnerTierSize,
    participation_count: uniqueVoters,
    expected_mints: expectedMints,
    reset_version: resetVersion,
  })
}
