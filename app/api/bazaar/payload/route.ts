import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'

const SOURCE_TAG = 2606230005
const XRPL_RPC = 'https://xrplcluster.com/'

type Action =
  | { action: 'accept'; offer_index: string }
  | { action: 'list'; nft_token_id: string; amount_xrp: number; account?: string }
  | { action: 'cancel'; offer_index: string; account?: string }

const ACCOUNT_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/

async function ledgerEntry(index: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(XRPL_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'ledger_entry', params: [{ index, ledger_index: 'validated' }] }),
    })
    const data = await res.json()
    return (data.result?.node as Record<string, unknown> | undefined) ?? null
  } catch {
    return null
  }
}

async function createXummPayload(txjson: Record<string, unknown>, instruction: string) {
  const apiKey = process.env.NEXT_PUBLIC_XAMAN_API_KEY
  const apiSecret = process.env.XAMAN_API_SECRET
  if (!apiKey || !apiSecret) {
    return { error: 'Xaman credentials not configured', status: 500 }
  }
  const res = await fetch('https://xumm.app/api/v1/platform/payload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'x-api-secret': apiSecret },
    body: JSON.stringify({
      txjson,
      custom_meta: { identifier: 'eigenthrope_bazaar', instruction },
      options: { submit: true, expire: 10 },
    }),
  })
  const data = await res.json()
  if (!res.ok) return { error: data, status: res.status }
  return { uuid: data.uuid, qr: data.refs?.qr_png, signUrl: data.next?.always }
}

function payloadResponse(result: Awaited<ReturnType<typeof createXummPayload>>): Response {
  const status = 'error' in result ? (result.status as number | undefined) ?? 500 : 200
  return Response.json(result, { status })
}

/**
 * Xaman payloads for bazaar actions. No Account is set on any txjson —
 * whoever scans signs, and the ledger enforces ownership rules (you can only
 * cancel your own offer, only list an NFT you hold, only buy what's offered).
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Action | null
  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()

  if (body?.action === 'accept') {
    // Verify on-ledger so the signer approves exactly what the page showed:
    // a public, XRP-priced sell offer from a player.
    const node = await ledgerEntry(body.offer_index)
    if (!node || node.LedgerEntryType !== 'NFTokenOffer') {
      return Response.json({ error: 'Offer no longer exists — it may have been sold or cancelled.' }, { status: 410 })
    }
    if (!((node.Flags as number) & 1)) {
      return Response.json({ error: 'Not a sell offer' }, { status: 400 })
    }
    if (node.Destination) {
      return Response.json({ error: 'This offer is a private trade' }, { status: 403 })
    }
    if (vaultAddress && node.Owner === vaultAddress) {
      return Response.json({ error: 'Claim offers are not bazaar trades' }, { status: 403 })
    }
    if (typeof node.Amount !== 'string') {
      return Response.json({ error: 'Only XRP-priced offers are supported' }, { status: 400 })
    }
    const xrp = Number(node.Amount) / 1_000_000
    return payloadResponse(await createXummPayload(
      {
        TransactionType: 'NFTokenAcceptOffer',
        NFTokenSellOffer: body.offer_index,
        SourceTag: SOURCE_TAG,
      },
      `Acquire this Eigenthrope artifact for ${xrp} XRP. Artifacts carry resonance — your observations will weigh more.`,
    ))
  }

  if (body?.action === 'list') {
    const amountXrp = Number(body.amount_xrp)
    if (!body.nft_token_id || !Number.isFinite(amountXrp) || amountXrp <= 0 || amountXrp > 100_000) {
      return Response.json({ error: 'nft_token_id and a positive amount_xrp required' }, { status: 400 })
    }
    // Only game artifacts belong in the bazaar
    const record = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_minting',
      Key: { nft_token_id: body.nft_token_id },
    }))
    if (!record.Item) {
      return Response.json({ error: 'Not a known Eigenthrope artifact' }, { status: 404 })
    }
    const drops = String(Math.round(amountXrp * 1_000_000))
    // Pin the signer to the wallet that holds the NFT — without Account,
    // Xaman signs with whatever wallet is active, which fails tecNO_ENTRY
    // when that wallet doesn't hold this token.
    const account = body.account?.trim()
    return payloadResponse(await createXummPayload(
      {
        TransactionType: 'NFTokenCreateOffer',
        ...(account && ACCOUNT_RE.test(account) ? { Account: account } : {}),
        NFTokenID: body.nft_token_id,
        Amount: drops,
        Flags: 1, // tfSellNFToken
        SourceTag: SOURCE_TAG,
      },
      `List this Eigenthrope artifact for ${amountXrp} XRP on the bazaar. Anyone may buy it — and the resonance it carries.`,
    ))
  }

  if (body?.action === 'cancel') {
    if (!body.offer_index) {
      return Response.json({ error: 'offer_index required' }, { status: 400 })
    }
    return payloadResponse(await createXummPayload(
      {
        TransactionType: 'NFTokenCancelOffer',
        NFTokenOffers: [body.offer_index],
        SourceTag: SOURCE_TAG,
      },
      'Withdraw your artifact listing from the Eigenthrope bazaar.',
    ))
  }

  return Response.json({ error: 'action must be accept, list, or cancel' }, { status: 400 })
}
