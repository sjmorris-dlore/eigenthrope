import { GetCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import type { Clue } from '@/lib/clues'

const TABLE = 'eigenthrope_clues'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await dynamo.send(new GetCommand({ TableName: TABLE, Key: { clue_id: id } }))
  if (!result.Item) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(result.Item)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json() as Partial<Clue>

  const existing = await dynamo.send(new GetCommand({ TableName: TABLE, Key: { clue_id: id } }))
  if (!existing.Item) return Response.json({ error: 'Not found' }, { status: 404 })

  const prev = existing.Item as Clue
  const updated: Clue = {
    ...prev,
    category: body.category ?? prev.category,
    title: body.title?.trim() ?? prev.title,
    description: body.description?.trim() ?? prev.description,
    is_false_lead: body.is_false_lead ?? prev.is_false_lead,
    prerequisites: body.prerequisites ?? prev.prerequisites,
    reveal_triggers: body.reveal_triggers ?? prev.reveal_triggers,
    notes: body.notes?.trim() ?? prev.notes,
    // Discovery fields — allow manual override
    discovered: body.discovered ?? prev.discovered,
    discovered_at: body.discovered !== undefined
      ? (body.discovered ? (prev.discovered_at ?? new Date().toISOString()) : undefined)
      : prev.discovered_at,
    discovered_in_universe: body.discovered_in_universe ?? prev.discovered_in_universe,
    discovered_in_branch: body.discovered_in_branch ?? prev.discovered_in_branch,
  }

  // Clear discovery fields when manually un-discovering
  if (body.discovered === false) {
    delete updated.discovered_at
    delete updated.discovered_in_universe
    delete updated.discovered_in_branch
  }

  await dynamo.send(new PutCommand({ TableName: TABLE, Item: updated }))
  return Response.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await dynamo.send(new DeleteCommand({ TableName: TABLE, Key: { clue_id: id } }))
  return Response.json({ ok: true })
}
