import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'

const ALIAS_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.\-']{1,19}$/u
const ACCOUNT_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/
// Roster names are reserved — players can't impersonate the observers
const RESERVED = ['vesper_null', 'amber_drift', 'eigenthrope']

/**
 * Prove wallet ownership via the Xaman OAuth2 session token the site's
 * wallet-connect flow already holds. The userinfo endpoint returns the
 * account the token was issued for — we never trust a client-supplied
 * account for writes.
 */
async function verifyAccount(authorization: string | null): Promise<string | null> {
  const token = authorization?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    const res = await fetch('https://oauth2.xumm.app/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const info = await res.json() as { sub?: string; account?: string }
    const account = (info.sub ?? info.account)?.trim()
    return account && ACCOUNT_RE.test(account) ? account : null
  } catch {
    return null
  }
}

/** Public read: the alias for an account (aliases are public by design). */
export async function GET(request: Request) {
  const account = new URL(request.url).searchParams.get('account')?.trim()
  if (!account || !ACCOUNT_RE.test(account)) {
    return Response.json({ error: 'valid account required' }, { status: 400 })
  }
  const res = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_config',
    Key: { key: `alias:${account}` },
  }))
  return Response.json({ account, alias: (res.Item?.value as string | undefined) ?? null })
}

export async function POST(request: Request) {
  const account = await verifyAccount(request.headers.get('authorization'))
  if (!account) {
    return Response.json({ error: 'Sign in with Xaman to set a display name' }, { status: 401 })
  }

  const { alias } = await request.json().catch(() => ({})) as { alias?: string }
  const trimmed = alias?.trim() ?? ''
  if (!ALIAS_RE.test(trimmed)) {
    return Response.json({ error: 'Display name must be 2–20 characters: letters, numbers, spaces, _.-\'' }, { status: 400 })
  }
  if (RESERVED.some(r => trimmed.toLowerCase().replace(/\s+/g, '_') === r)) {
    return Response.json({ error: 'That name is reserved' }, { status: 409 })
  }

  await dynamo.send(new PutCommand({
    TableName: 'eigenthrope_config',
    Item: { key: `alias:${account}`, value: trimmed, updated_at: new Date().toISOString() },
  }))
  return Response.json({ ok: true, account, alias: trimmed })
}

export async function DELETE(request: Request) {
  const account = await verifyAccount(request.headers.get('authorization'))
  if (!account) {
    return Response.json({ error: 'Sign in with Xaman to remove your display name' }, { status: 401 })
  }
  await dynamo.send(new DeleteCommand({
    TableName: 'eigenthrope_config',
    Key: { key: `alias:${account}` },
  }))
  return Response.json({ ok: true, account, alias: null })
}
