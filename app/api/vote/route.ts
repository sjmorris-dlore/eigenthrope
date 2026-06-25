import { NextRequest } from 'next/server'

const XAMAN_API = 'https://xumm.app/api/v1/platform/payload'
const SOURCE_TAG = 2606230005

function toHex(str: string) {
  return Buffer.from(str, 'utf8').toString('hex').toUpperCase()
}

export async function POST(request: NextRequest) {
  const { universe, chapter, choicePoint, choice, account } = await request.json()

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
      Account: account,
      Destination: process.env.EIGENTHROPE_VAULT_ADDRESS,
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
    return Response.json({ error: data }, { status: res.status })
  }

  return Response.json({
    uuid: data.uuid,
    qr: data.refs.qr_png,
    signUrl: data.next.always,
  })
}
