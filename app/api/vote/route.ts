import { NextRequest } from 'next/server'
import { getResonance } from '@/lib/resonance'
import { getResetVersion } from '@/lib/config'

const XAMAN_API = 'https://xumm.app/api/v1/platform/payload'
const SOURCE_TAG = 2606230005

function toHex(str: string) {
  return Buffer.from(str, 'utf8').toString('hex').toUpperCase()
}

export async function POST(request: NextRequest) {
  const { universe, chapter, choicePoint, choice, account } = await request.json()

  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
  if (!vaultAddress) {
    return Response.json({ error: 'EIGENTHROPE_VAULT_ADDRESS not set' }, { status: 500 })
  }

  const apiKey = process.env.NEXT_PUBLIC_XAMAN_API_KEY
  const apiSecret = process.env.XAMAN_API_SECRET
  if (!apiKey || !apiSecret) {
    console.error('[vote] Missing Xaman credentials — key:', !!apiKey, 'secret:', !!apiSecret)
    return Response.json({ error: 'Xaman credentials not configured' }, { status: 500 })
  }

  const [weight, rv] = await Promise.all([
    getResonance(account.trim(), vaultAddress),
    getResetVersion(),
  ])

  const memoData = JSON.stringify({
    universe,
    chapter,
    choice_point: choicePoint,
    choice,
    weight,
    rv,
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
      'X-API-Key': apiKey,
      'X-API-Secret': apiSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json()

  if (!res.ok) {
    console.error('[vote] Xaman error', res.status, JSON.stringify(data), '— account:', account, 'vault:', vaultAddress)
    return Response.json({ error: data, status: res.status }, { status: res.status })
  }

  return Response.json({
    uuid: data.uuid,
    qr: data.refs.qr_png,
    signUrl: data.next.always,
  })
}
