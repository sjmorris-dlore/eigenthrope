import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion } from '@/lib/config'
import { publicChoices } from '@/lib/behavioral'
import { fetchVaultTransactions, getLiveWeights } from '@/lib/resonance'
import type { ChapterData } from '@/app/api/chapter/route'

const TABLE = 'eigenthrope_tallies'
const CACHE_TTL_MS = 30_000

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

/**
 * Live tally with LIVE weights: memos decide each voter's choice; weight is
 * what the voter holds right now. Mirrors the close computation, so the
 * running display and the final result can't disagree — and trading
 * artifacts moves the tally until the deadline.
 */
async function computeTallyFromChain(
  vaultAddress: string,
  universe: string,
  chapter: string,
  cp: string,
  resetVersion: number
): Promise<{ counts: Record<string, number>; voter_count: number }> {
  const transactions = await fetchVaultTransactions(vaultAddress, 200)

  const latestChoice: Record<string, string> = {}
  const seenAccounts = new Set<string>()

  for (const entry of transactions) {
    const tx = (entry as Record<string, unknown>).tx_json ??
                (entry as Record<string, unknown>).tx
    if (!tx || (tx as Record<string, unknown>).TransactionType !== 'Payment') continue

    const sender = ((tx as Record<string, unknown>).Account as string)?.trim()
    if (!sender || seenAccounts.has(sender)) continue

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
          latestChoice[sender] = vote.choice
          seenAccounts.add(sender)
        }
      } catch {
        // skip malformed memos
      }
    }
  }

  const weights = await getLiveWeights(Object.keys(latestChoice), vaultAddress, transactions)
  const counts: Record<string, number> = {}
  for (const [sender, choice] of Object.entries(latestChoice)) {
    counts[choice] = (counts[choice] ?? 0) + (weights[sender] ?? 1)
  }
  return { counts, voter_count: Object.keys(latestChoice).length }
}

export async function GET() {
  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
  if (!vaultAddress) {
    return Response.json({ error: 'EIGENTHROPE_VAULT_ADDRESS not set' }, { status: 500 })
  }

  const [configItem, resetVersion] = await Promise.all([
    dynamo.send(new GetCommand({ TableName: 'eigenthrope_config', Key: { key: 'active_choice_point' } })),
    getResetVersion(),
  ])

  if (!configItem.Item) {
    return Response.json({ error: 'No active choice point' }, { status: 404 })
  }

  const choicePoint = configItem.Item.value as string
  const cp = choicePoint.split(':')[2]

  const chapterItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_chapters',
    Key: { choice_point: choicePoint },
  }))

  const chapterData = chapterItem.Item as ChapterData | undefined
  // Use stored fields, not key segments — they may differ after migrations.
  const universe = chapterData?.universe
  const chapter = chapterData?.chapter

  // Closed chapters return their canonical final tally — no chain query needed
  if (chapterData?.status === 'closed' && chapterData.final_tally) {
    return Response.json({
      counts: chapterData.final_tally,
      choices: publicChoices(chapterData.choices),
      cached: false,
      closed: true,
      winning_choice: chapterData.winning_choice,
    })
  }

  // Check cache — only use if it matches the current reset version
  const cached = await dynamo.send(new GetCommand({
    TableName: TABLE,
    Key: { choice_point: choicePoint },
  }))

  if (cached.Item && (cached.Item.reset_version ?? 0) === resetVersion) {
    const age = Date.now() - new Date(cached.Item.last_updated).getTime()
    if (age < CACHE_TTL_MS) {
      return Response.json({
        counts: cached.Item.counts,
        voter_count: cached.Item.voter_count ?? 0,
        choices: publicChoices(chapterData?.choices),
        cached: true,
      })
    }
  }

  // Cache miss, stale, or wrong reset version — recompute from chain
  if (!universe || !chapter) {
    return Response.json({ error: 'Chapter data missing universe/chapter fields' }, { status: 500 })
  }
  const { counts, voter_count } = await computeTallyFromChain(vaultAddress, universe, chapter, cp, resetVersion)

  await dynamo.send(new PutCommand({
    TableName: TABLE,
    Item: {
      choice_point: choicePoint,
      counts,
      voter_count,
      reset_version: resetVersion,
      last_updated: new Date().toISOString(),
    },
  }))

  return Response.json({ counts, voter_count, choices: publicChoices(chapterData?.choices), cached: false })
}

export async function DELETE() {
  const configItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_config',
    Key: { key: 'active_choice_point' },
  }))
  if (!configItem.Item) return Response.json({ ok: true })

  const choicePoint = configItem.Item.value as string
  await dynamo.send(new DeleteCommand({
    TableName: TABLE,
    Key: { choice_point: choicePoint },
  }))
  return Response.json({ ok: true })
}
