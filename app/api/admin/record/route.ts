import { ScanCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { SEALS_TABLE, type SealRecord } from '@/lib/record'

/**
 * Admin view of The Record (route protected by middleware like all
 * /api/admin/*). Judging is reveal-driven: this lists revealed seals
 * awaiting a verdict first, then everything else for reference —
 * including still-sealed text, which only the author may see early.
 */
export async function GET() {
  const result = await dynamo.send(new ScanCommand({ TableName: SEALS_TABLE }))
  const seals = ((result.Items ?? []) as SealRecord[])
    .filter(s => s.status !== 'pending_signature')
    .sort((a, b) => {
      // Revealed-awaiting-judgment first, then newest
      const aOpen = a.status === 'revealed' ? 0 : 1
      const bOpen = b.status === 'revealed' ? 0 : 1
      if (aOpen !== bOpen) return aOpen - bOpen
      return (b.sealed_at ?? b.created_at).localeCompare(a.sealed_at ?? a.created_at)
    })
  return Response.json({ seals })
}

/** Judge a revealed seal: vindicated, denied, or back to open (revealed). */
export async function POST(request: Request) {
  const { seal_id, verdict, note } = await request.json().catch(() => ({})) as {
    seal_id?: string
    verdict?: 'vindicated' | 'denied' | 'revealed'
    note?: string
  }
  if (!seal_id || !verdict || !['vindicated', 'denied', 'revealed'].includes(verdict)) {
    return Response.json({ error: 'seal_id and verdict (vindicated|denied|revealed) required' }, { status: 400 })
  }

  try {
    await dynamo.send(new UpdateCommand({
      TableName: SEALS_TABLE,
      Key: { seal_id },
      UpdateExpression: verdict === 'revealed'
        ? 'SET #s = :v REMOVE judged_at, judgment_note'
        : 'SET #s = :v, judged_at = :now, judgment_note = :note',
      // Only revealed (or re-judged) seals can be judged — never sealed ones,
      // which would leak that the author read them early.
      ConditionExpression: '#s IN (:revealed, :vindicated, :denied)',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':v': verdict,
        ':revealed': 'revealed',
        ':vindicated': 'vindicated',
        ':denied': 'denied',
        ...(verdict !== 'revealed' ? {
          ':now': new Date().toISOString(),
          ':note': note?.trim() ?? '',
        } : {}),
      },
    }))
  } catch {
    return Response.json({ error: 'Seal not judgeable (not revealed yet?)' }, { status: 409 })
  }

  return Response.json({ ok: true, seal_id, status: verdict })
}

/**
 * Admin spot-delete — for cleaning test seals without a full game reset.
 * (A game reset deletes ALL seals automatically; this is the scalpel.)
 * The on-ledger transaction obviously persists; only the game's record
 * of it is removed.
 */
export async function DELETE(request: Request) {
  const { seal_id } = await request.json().catch(() => ({})) as { seal_id?: string }
  if (!seal_id) return Response.json({ error: 'seal_id required' }, { status: 400 })

  await dynamo.send(new DeleteCommand({
    TableName: SEALS_TABLE,
    Key: { seal_id },
  }))
  return Response.json({ ok: true, seal_id, deleted: true })
}
