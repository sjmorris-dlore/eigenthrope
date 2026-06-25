import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import type { ChapterData } from '@/app/api/chapter/route'

const XRPL_RPC = 'https://xrplcluster.com/'
const TABLE = 'eigenthrope_tallies'
const CACHE_TTL_MS = 30_000

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

async function computeTallyFromChain(
  vaultAddress: string,
  universe: string,
  chapter: string,
  cp: string
): Promise<Record<string, number>> {
  const res = await fetch(XRPL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'account_tx',
      params: [{ account: vaultAddress, limit: 200 }],
    }),
  })

  const data = await res.json()
  const transactions: unknown[] = data.result?.transactions ?? []

  const latestVote: Record<string, { choice: string; weight: number }> = {}
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
          vote.choice_point === cp
        ) {
          latestVote[sender] = { choice: vote.choice, weight: vote.weight ?? 1 }
          seenAccounts.add(sender)
        }
      } catch {
        // skip malformed memos
      }
    }
  }

  const counts: Record<string, number> = {}
  for (const { choice, weight } of Object.values(latestVote)) {
    counts[choice] = (counts[choice] ?? 0) + weight
  }
  return counts
}

export async function GET() {
  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
  if (!vaultAddress) {
    return Response.json({ error: 'EIGENTHROPE_VAULT_ADDRESS not set' }, { status: 500 })
  }

  const configItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_config',
    Key: { key: 'active_choice_point' },
  }))

  if (!configItem.Item) {
    return Response.json({ error: 'No active choice point' }, { status: 404 })
  }

  const choicePoint = configItem.Item.value as string
  const [universe, chapter, cp] = choicePoint.split(':')

  const chapterItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_chapters',
    Key: { choice_point: choicePoint },
  }))

  const chapterData = chapterItem.Item as ChapterData | undefined

  // Check cache
  const cached = await dynamo.send(new GetCommand({
    TableName: TABLE,
    Key: { choice_point: choicePoint },
  }))

  if (cached.Item) {
    const age = Date.now() - new Date(cached.Item.last_updated).getTime()
    if (age < CACHE_TTL_MS) {
      return Response.json({ counts: cached.Item.counts, choices: chapterData?.choices ?? {}, cached: true })
    }
  }

  // Cache miss or stale — recompute from chain
  const counts = await computeTallyFromChain(vaultAddress, universe, chapter, cp)

  await dynamo.send(new PutCommand({
    TableName: TABLE,
    Item: {
      choice_point: choicePoint,
      counts,
      last_updated: new Date().toISOString(),
    },
  }))

  return Response.json({ counts, choices: chapterData?.choices ?? {}, cached: false })
}
