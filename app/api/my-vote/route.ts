import { NextRequest } from 'next/server'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion } from '@/lib/config'
import type { ChapterData } from '@/app/api/chapter/route'

const XRPL_RPC = 'https://xrplcluster.com/'

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

export async function GET(request: NextRequest) {
  const account = request.nextUrl.searchParams.get('account')?.trim()
  if (!account) return Response.json({ choice: null }, { status: 200 })

  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
  if (!vaultAddress) return Response.json({ error: 'EIGENTHROPE_VAULT_ADDRESS not set' }, { status: 500 })

  const [configItem, resetVersion] = await Promise.all([
    dynamo.send(new GetCommand({ TableName: 'eigenthrope_config', Key: { key: 'active_choice_point' } })),
    getResetVersion(),
  ])

  if (!configItem.Item) return Response.json({ choice: null }, { status: 200 })

  const choicePoint = configItem.Item.value as string
  const cp = choicePoint.split(':')[2]

  const chapterItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_chapters',
    Key: { choice_point: choicePoint },
  }))
  const chapterData = chapterItem.Item as ChapterData | undefined

  // Use the stored universe/chapter fields, not the choice_point key segments.
  // The chapter field may differ from the key (e.g. "C01" vs "E01" after migration).
  const universe = chapterData?.universe
  const chapter = chapterData?.chapter

  // Scan the player's own account_tx for outgoing payments to the vault
  const res = await fetch(XRPL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'account_tx',
      params: [{ account, limit: 200, forward: false }],
    }),
  })

  const data = await res.json()
  const transactions: unknown[] = data.result?.transactions ?? []

  for (const entry of transactions) {
    const tx = (entry as Record<string, unknown>).tx_json ??
                (entry as Record<string, unknown>).tx
    if (!tx) continue
    const t = tx as Record<string, unknown>
    if (t.TransactionType !== 'Payment') continue
    if ((t.Destination as string)?.trim() !== vaultAddress) continue

    const memos = t.Memos as Array<{ Memo: { MemoData?: string } }> | undefined
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
          const choice: string = vote.choice
          const label = chapterData?.choices?.[choice]?.label ?? null
          return Response.json({ choice, label })
        }
      } catch {
        // skip malformed memos
      }
    }
  }

  return Response.json({ choice: null })
}
