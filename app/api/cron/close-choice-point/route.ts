import { GetCommand, UpdateCommand, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion } from '@/lib/config'
import { postDiscord, chapterClosedEmbed } from '@/lib/discord'
import type { ChapterData } from '@/app/api/chapter/route'
import type { Clue } from '@/lib/clues'
import { emptyProfile, accumulateWeights } from '@/lib/behavioral'
import type { BehavioralProfile } from '@/lib/behavioral'

const XRPL_RPC = 'https://xrplcluster.com/'
const MIN_YIELD = 0.05
const MAX_YIELD = 0.25

function computeYield(p: number): number {
  const t = Math.max(0, Math.min(1, (p - 0.5) * 2))
  return MIN_YIELD + (MAX_YIELD - MIN_YIELD) * (1 - t)
}

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

async function computeFinalTally(
  vaultAddress: string,
  universe: string,
  chapter: string,
  cp: string,
  resetVersion: number
): Promise<Record<string, number>> {
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
  const latestVote: Record<string, { choice: string; weight: number }> = {}
  const seen = new Set<string>()

  for (const entry of transactions) {
    const tx = (entry as Record<string, unknown>).tx_json ??
                (entry as Record<string, unknown>).tx
    if (!tx || (tx as Record<string, unknown>).TransactionType !== 'Payment') continue
    const sender = ((tx as Record<string, unknown>).Account as string)?.trim()
    if (!sender || seen.has(sender)) continue
    const memos = (tx as Record<string, unknown>).Memos as Array<{ Memo: { MemoData?: string } }> | undefined
    if (!memos) continue
    for (const { Memo } of memos) {
      if (!Memo.MemoData) continue
      try {
        const vote = JSON.parse(fromHex(Memo.MemoData))
        if (
          vote.universe === universe &&
          vote.chapter === chapter &&
          vote.choice_point === cp &&
          (vote.rv ?? 0) === resetVersion
        ) {
          latestVote[sender] = { choice: vote.choice, weight: vote.weight ?? 1 }
          seen.add(sender)
        }
      } catch { /* skip */ }
    }
  }

  const counts: Record<string, number> = {}
  for (const { choice, weight } of Object.values(latestVote)) {
    counts[choice] = (counts[choice] ?? 0) + weight
  }
  return counts
}

export async function GET(request: Request) {
  // Verify Vercel cron secret
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
  if (!vaultAddress) {
    return Response.json({ error: 'EIGENTHROPE_VAULT_ADDRESS not set' }, { status: 500 })
  }

  const configItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_config',
    Key: { key: 'active_choice_point' },
  }))
  if (!configItem.Item) {
    return Response.json({ skipped: 'No active choice point' })
  }

  const choicePoint = configItem.Item.value as string
  const chapterItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_chapters',
    Key: { choice_point: choicePoint },
  }))

  const chapter = chapterItem.Item as ChapterData | undefined
  if (!chapter) return Response.json({ skipped: 'Chapter not found' })
  if (chapter.status === 'closed') return Response.json({ skipped: 'Already closed' })
  if (!chapter.voting_closes_at) return Response.json({ skipped: 'No deadline set' })
  if (new Date(chapter.voting_closes_at) > new Date()) {
    return Response.json({ skipped: 'Deadline not yet reached', closes_at: chapter.voting_closes_at })
  }

  // Deadline passed — compute final tally and close
  // Use stored universe/chapter fields, not key segments — they may differ after migrations.
  const cp = choicePoint.split(':')[2]
  const resetVersion = await getResetVersion()
  const finalTally = await computeFinalTally(vaultAddress, chapter.universe, chapter.chapter, cp, resetVersion)

  const total = Object.values(finalTally).reduce((a, b) => a + b, 0)
  const winningChoice = total > 0
    ? Object.entries(finalTally).sort((a, b) => b[1] - a[1])[0][0]
    : null
  const winnerWeight = winningChoice ? (finalTally[winningChoice] ?? 0) : 0
  const yieldPct = total > 0 ? computeYield(winnerWeight / total) : MAX_YIELD

  await dynamo.send(new UpdateCommand({
    TableName: 'eigenthrope_chapters',
    Key: { choice_point: choicePoint },
    UpdateExpression: `SET #s = :closed, closed_at = :now, winning_choice = :wc,
                       final_tally = :ft, final_yield_pct = :yp`,
    ConditionExpression: '#s = :open',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':closed': 'closed',
      ':open': 'open',
      ':now': new Date().toISOString(),
      ':wc': winningChoice,
      ':ft': finalTally,
      ':yp': yieldPct,
    },
  }))

  // Accumulate behavioral weights from winning choice into running profile
  if (winningChoice) {
    const weights = chapter.choices?.[winningChoice]?.behavioral_weights
    if (weights && Object.keys(weights).length > 0) {
      const profileItem = await dynamo.send(new GetCommand({
        TableName: 'eigenthrope_config',
        Key: { key: 'behavioral_profile' },
      }))
      const existing = (profileItem.Item?.value ?? {}) as Partial<BehavioralProfile>
      const merged = accumulateWeights({ ...emptyProfile(), ...existing }, weights)
      await dynamo.send(new PutCommand({
        TableName: 'eigenthrope_config',
        Item: { key: 'behavioral_profile', value: merged },
      }))
    }
  }

  // Auto-discover clues triggered by this branch outcome
  if (winningChoice) {
    const cluesResult = await dynamo.send(new ScanCommand({ TableName: 'eigenthrope_clues' }))
    const now = new Date().toISOString()
    const [universe] = choicePoint.split(':')
    await Promise.all(
      ((cluesResult.Items ?? []) as Clue[])
        .filter(c =>
          !c.discovered &&
          (c.reveal_triggers ?? []).some(
            t => t.choice_point === choicePoint && t.winning_choice === winningChoice
          )
        )
        .map(c =>
          dynamo.send(new PutCommand({
            TableName: 'eigenthrope_clues',
            Item: {
              ...c,
              discovered: true,
              discovered_at: now,
              discovered_in_universe: universe,
              discovered_in_branch: choicePoint,
            },
          }))
        )
    )
  }

  const winningLabel = winningChoice ? chapter.choices?.[winningChoice]?.label ?? null : null
  await postDiscord(chapterClosedEmbed(
    chapter.chapter_label ?? choicePoint,
    winningChoice,
    winningLabel,
    finalTally,
  ))

  return Response.json({
    closed: choicePoint,
    winning_choice: winningChoice,
    final_tally: finalTally,
    yield_pct: yieldPct,
  })
}
