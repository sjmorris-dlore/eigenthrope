import { NextRequest } from 'next/server'

const XAMAN_API = 'https://xumm.app/api/v1/platform/payload'
const XRPL_RPC = 'https://xrplcluster.com/'
const SOURCE_TAG = 2606230005

function toHex(str: string) {
  return Buffer.from(str, 'utf8').toString('hex').toUpperCase()
}

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

async function hasAlreadyVoted(
  account: string,
  vaultAddress: string,
  universe: string,
  chapter: string,
  choicePoint: string
): Promise<boolean> {
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

  for (const entry of transactions) {
    const tx = (entry as Record<string, unknown>).tx_json ??
                (entry as Record<string, unknown>).tx
    if (!tx) continue
    const t = tx as Record<string, unknown>
    if (t.TransactionType !== 'Payment') continue
    if ((t.Account as string)?.trim() !== account) continue

    const memos = t.Memos as Array<{ Memo: { MemoData?: string } }> | undefined
    if (!memos) continue

    for (const { Memo } of memos) {
      if (!Memo.MemoData) continue
      try {
        const vote = JSON.parse(fromHex(Memo.MemoData))
        if (
          vote.universe === universe &&
          vote.chapter === chapter &&
          vote.choice_point === choicePoint
        ) {
          return true
        }
      } catch {
        // skip malformed memos
      }
    }
  }

  return false
}

export async function POST(request: NextRequest) {
  const { universe, chapter, choicePoint, choice, account } = await request.json()

  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
  if (!vaultAddress) {
    return Response.json({ error: 'EIGENTHROPE_VAULT_ADDRESS not set' }, { status: 500 })
  }

  const alreadyVoted = await hasAlreadyVoted(
    account.trim(),
    vaultAddress,
    universe,
    chapter,
    choicePoint
  )

  if (alreadyVoted) {
    return Response.json({ error: 'already_voted' }, { status: 409 })
  }

  const memoData = JSON.stringify({
    universe,
    chapter,
    choice_point: choicePoint,
    choice,
    weight: 1.0,
  })

  const payload = {
    txjson: {
      TransactionType: 'Payment',
      Account: account.trim(),
      Destination: vaultAddress,
      Amount: '1',
      SourceTag: SOURCE_TAG,
      Memos: [
        {
          Memo: {
            MemoData: toHex(memoData),
            MemoType: toHex('eigenthrope/vote'),
          },
        },
      ],
    },
  }

  const res = await fetch(XAMAN_API, {
    method: 'POST',
    headers: {
      'X-API-Key': process.env.NEXT_PUBLIC_XAMAN_API_KEY!,
      'X-API-Secret': process.env.XAMAN_API_SECRET!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json()

  if (!res.ok) {
    console.error('Xaman API error:', JSON.stringify(data))
    return Response.json({ error: data, status: res.status }, { status: res.status })
  }

  return Response.json({
    uuid: data.uuid,
    qr: data.refs.qr_png,
    signUrl: data.next.always,
  })
}
