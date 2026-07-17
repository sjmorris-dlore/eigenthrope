import { ScanCommand, GetCommand, UpdateCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion } from '@/lib/config'
import {
  SEALS_TABLE, publicSeal, verifyXamanAccount, type SealRecord, type PublicSeal,
} from '@/lib/record'

/**
 * GET — the public Record: every seal as a stub (owner, when, hash, context),
 * with text visible only once revealed. Pass a Xaman session Bearer token to
 * additionally see your own still-sealed text.
 */
export async function GET(request: Request) {
  const [viewer, result, rv] = await Promise.all([
    verifyXamanAccount(request.headers.get('authorization')),
    dynamo.send(new ScanCommand({
      TableName: SEALS_TABLE,
      FilterExpression: '#s <> :pending',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':pending': 'pending_signature' },
    })),
    getResetVersion(),
  ])

  // Current iteration only — reset deletes seals anyway, but this guards
  // against a partially failed reset leaving orphans on the public board.
  // Seals from before rv stamping (reset_version absent) are treated as current.
  const seals = ((result.Items ?? []) as SealRecord[])
    .filter(s => s.reset_version === undefined || s.reset_version === rv)
    .sort((a, b) => (b.sealed_at ?? b.created_at).localeCompare(a.sealed_at ?? a.created_at))

  // Resolve display aliases for the accounts on the board (public info)
  const accounts = [...new Set(seals.map(s => s.account))]
  const aliases: Record<string, string> = {}
  if (accounts.length > 0) {
    try {
      const aliasRes = await dynamo.send(new BatchGetCommand({
        RequestItems: {
          eigenthrope_config: {
            Keys: accounts.slice(0, 100).map(a => ({ key: `alias:${a}` })),
          },
        },
      }))
      for (const item of aliasRes.Responses?.eigenthrope_config ?? []) {
        const key = item.key as string
        aliases[key.slice('alias:'.length)] = item.value as string
      }
    } catch { /* aliases are cosmetic */ }
  }

  const out: Array<PublicSeal & { alias?: string }> = seals.map(s => ({
    ...publicSeal(s, viewer),
    ...(aliases[s.account] ? { alias: aliases[s.account] } : {}),
  }))

  return Response.json({ seals: out, viewer })
}

/**
 * POST — reveal one of your seals. Owner-only (Xaman session token). The
 * text and salt go public; anyone can now verify the hash against the
 * on-ledger memo. Judgment comes later, from the author, when the story
 * has actually spoken.
 */
export async function POST(request: Request) {
  const account = await verifyXamanAccount(request.headers.get('authorization'))
  if (!account) {
    return Response.json({ error: 'Sign in with Xaman to reveal an observation' }, { status: 401 })
  }

  const { seal_id } = await request.json().catch(() => ({})) as { seal_id?: string }
  if (!seal_id) return Response.json({ error: 'seal_id required' }, { status: 400 })

  const item = await dynamo.send(new GetCommand({
    TableName: SEALS_TABLE,
    Key: { seal_id },
  }))
  const seal = item.Item as SealRecord | undefined
  if (!seal || seal.account !== account) {
    return Response.json({ error: 'Not your seal' }, { status: 403 })
  }
  if (seal.status !== 'sealed') {
    return Response.json({ error: 'Only sealed observations can be revealed' }, { status: 409 })
  }

  await dynamo.send(new UpdateCommand({
    TableName: SEALS_TABLE,
    Key: { seal_id },
    UpdateExpression: 'SET #s = :revealed, revealed_at = :now',
    ConditionExpression: '#s = :sealed',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':revealed': 'revealed',
      ':sealed': 'sealed',
      ':now': new Date().toISOString(),
    },
  }))

  return Response.json({ ok: true, seal_id, status: 'revealed' })
}
