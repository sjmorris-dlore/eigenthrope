import { ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import type { Clue } from '@/lib/clues'

const TABLE = 'eigenthrope_clues'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const category = url.searchParams.get('category')

  const result = await dynamo.send(new ScanCommand({ TableName: TABLE }))
  let clues = (result.Items ?? []) as Clue[]

  if (category) clues = clues.filter(c => c.category === category)

  clues.sort((a, b) => a.clue_id.localeCompare(b.clue_id))
  return Response.json(clues)
}

export async function POST(request: Request) {
  const body = await request.json() as Partial<Clue>
  const { clue_id, category, title } = body

  if (!clue_id || !category || !title) {
    return Response.json({ error: 'clue_id, category, and title are required' }, { status: 400 })
  }

  const clue: Clue = {
    clue_id: clue_id.trim().toUpperCase(),
    category,
    title: title.trim(),
    description: body.description?.trim() ?? '',
    is_false_lead: body.is_false_lead ?? false,
    discovered: false,
    prerequisites: body.prerequisites ?? [],
    reveal_triggers: body.reveal_triggers ?? [],
    notes: body.notes?.trim() ?? '',
  }

  await dynamo.send(new PutCommand({ TableName: TABLE, Item: clue }))
  return Response.json(clue, { status: 201 })
}
