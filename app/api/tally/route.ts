import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'

const XRPL_RPC = 'https://xrplcluster.com/'
const TABLE = 'eigenthrope_tallies'
const CACHE_TTL_MS = 30_000

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

async function computeTallyFromChain(vaultAddress: string): Promise<Record<string, number>> {
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
          vote.universe === 'U001' &&
          vote.chapter === 'C01' &&
          vote.choice_point === 'CP1'
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

  const choicePoint = 'U001:C01:CP1'

  // Check cache
  const cached = await dynamo.send(new GetCommand({
    TableName: TABLE,
    Key: { choice_point: choicePoint },
  }))

  if (cached.Item) {
    const age = Date.now() - new Date(cached.Item.last_updated).getTime()
    if (age < CACHE_TTL_MS) {
      return Response.json({ counts: cached.Item.counts, cached: true })
    }
  }

  // Cache miss or stale — recompute from chain
  const counts = await computeTallyFromChain(vaultAddress)

  await dynamo.send(new PutCommand({
    TableName: TABLE,
    Item: {
      choice_point: choicePoint,
      counts,
      last_updated: new Date().toISOString(),
    },
  }))

  return Response.json({ counts, cached: false })
}
