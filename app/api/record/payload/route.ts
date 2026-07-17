import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion } from '@/lib/config'
import {
  SEALS_TABLE, SEAL_CAP, SEAL_TEXT_MIN, SEAL_TEXT_MAX, PENDING_TTL_MS,
  ACCOUNT_RE, newSalt, sealHash, type SealRecord,
} from '@/lib/record'

const XAMAN_API = 'https://xumm.app/api/v1/platform/payload'
const SOURCE_TAG = 2606230005

function toHex(str: string) {
  return Buffer.from(str, 'utf8').toString('hex').toUpperCase()
}

/** Where the game stands right now — recorded on the seal as provenance flavor. */
async function currentContext(): Promise<string> {
  try {
    const cpItem = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'active_choice_point' },
    }))
    const cp = cpItem.Item?.value as string | undefined
    if (!cp) return 'between episodes'
    const chapter = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_chapters',
      Key: { choice_point: cp },
    }))
    const label = chapter.Item?.chapter_label as string | undefined
    const [universe] = cp.split(':')
    return label ? `${universe} · ${label}` : cp
  } catch {
    return 'unknown'
  }
}

/**
 * Create a Xaman payload that seals an observation: a 1-drop payment to the
 * vault carrying the salted hash of the theory text. The text itself never
 * leaves the server's custody. The Account is pinned so the payload can only
 * be signed by the wallet that will own the seal.
 */
export async function POST(request: Request) {
  const { text, account } = await request.json().catch(() => ({})) as { text?: string; account?: string }

  const trimmedAccount = account?.trim() ?? ''
  if (!ACCOUNT_RE.test(trimmedAccount)) {
    return Response.json({ error: 'valid account required' }, { status: 400 })
  }
  const trimmedText = text?.trim() ?? ''
  if (trimmedText.length < SEAL_TEXT_MIN || trimmedText.length > SEAL_TEXT_MAX) {
    return Response.json(
      { error: `Observation must be ${SEAL_TEXT_MIN}–${SEAL_TEXT_MAX} characters.` },
      { status: 400 },
    )
  }

  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
  if (!vaultAddress) {
    return Response.json({ error: 'EIGENTHROPE_VAULT_ADDRESS not set' }, { status: 500 })
  }
  const apiKey = process.env.NEXT_PUBLIC_XAMAN_API_KEY
  const apiSecret = process.env.XAMAN_API_SECRET
  if (!apiKey || !apiSecret) {
    return Response.json({ error: 'Xaman credentials not configured' }, { status: 500 })
  }

  // Anti-shotgun cap: at most SEAL_CAP unrevealed seals per wallet. Fresh
  // pending payloads count too so the cap can't be raced; stale pendings
  // (abandoned/expired in Xaman) are ignored.
  const existing = await dynamo.send(new QueryCommand({
    TableName: SEALS_TABLE,
    IndexName: 'account-index',
    KeyConditionExpression: 'account = :a',
    ExpressionAttributeValues: { ':a': trimmedAccount },
  }))
  const now = Date.now()
  const active = ((existing.Items ?? []) as SealRecord[]).filter(s =>
    s.status === 'sealed' ||
    (s.status === 'pending_signature' && now - new Date(s.created_at).getTime() < PENDING_TTL_MS)
  )
  if (active.length >= SEAL_CAP) {
    return Response.json(
      { error: `The Record holds at most ${SEAL_CAP} sealed observations per observer. Reveal one to seal another.` },
      { status: 409 },
    )
  }

  const salt = newSalt()
  const hash = sealHash(salt, trimmedText)
  const memoData = JSON.stringify({ h: hash, v: 1 })

  const payload = {
    txjson: {
      TransactionType: 'Payment',
      Account: trimmedAccount, // pinned — only this wallet can sign the seal
      Destination: vaultAddress,
      Amount: '1',
      SourceTag: SOURCE_TAG,
      Memos: [
        {
          Memo: {
            MemoData: toHex(memoData),
            MemoType: toHex('eigenthrope/seal'),
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
    console.error('[record] Xaman error', res.status, JSON.stringify(data))
    return Response.json({ error: 'Could not create the signing request' }, { status: 502 })
  }

  const [context, resetVersion] = await Promise.all([currentContext(), getResetVersion()])
  const record: SealRecord = {
    seal_id: data.uuid,
    account: trimmedAccount,
    status: 'pending_signature',
    text: trimmedText,
    salt,
    hash,
    context,
    reset_version: resetVersion,
    created_at: new Date().toISOString(),
  }
  await dynamo.send(new PutCommand({ TableName: SEALS_TABLE, Item: record }))

  return Response.json({
    uuid: data.uuid,
    qr: data.refs.qr_png,
    signUrl: data.next.always,
    hash,
  })
}
