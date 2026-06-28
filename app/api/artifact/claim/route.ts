import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'

export async function POST(request: Request) {
  const { account, offer_id } = await request.json()

  if (!account || !offer_id) {
    return Response.json({ error: 'account and offer_id required' }, { status: 400 })
  }

  // Verify the offer belongs to this account and is still pending
  const item = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_artifacts',
    Key: { offer_id },
  }))

  if (!item.Item) {
    return Response.json({ error: 'Offer not found' }, { status: 404 })
  }
  if (item.Item.winner_address !== account.trim()) {
    return Response.json({ error: 'Offer does not belong to this account' }, { status: 403 })
  }
  if (item.Item.status !== 'pending') {
    return Response.json({ error: `Offer is ${item.Item.status}` }, { status: 409 })
  }
  if (new Date(item.Item.expires_at) < new Date()) {
    return Response.json({ error: 'Offer has expired' }, { status: 410 })
  }

  const apiKey = process.env.NEXT_PUBLIC_XAMAN_API_KEY
  const apiSecret = process.env.XAMAN_API_SECRET
  if (!apiKey || !apiSecret) {
    return Response.json({ error: 'Xaman credentials not configured' }, { status: 500 })
  }

  const payload = {
    txjson: {
      TransactionType: 'NFTokenAcceptOffer',
      NFTokenSellOffer: offer_id,
      SourceTag: 2606230005,
    },
    custom_meta: {
      instruction: `Claim your Eigenthrope artifact from ${item.Item.choice_point}`,
    },
  }

  const res = await fetch('https://xumm.app/api/v1/platform/payload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'x-api-secret': apiSecret,
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json()
  if (!res.ok) {
    return Response.json({ error: data }, { status: res.status })
  }

  return Response.json({
    uuid: data.uuid,
    qr: data.refs?.qr_png,
    signUrl: data.next?.always,
  })
}
