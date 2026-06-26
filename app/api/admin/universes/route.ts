import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'

export async function GET() {
  const [universesResult, chaptersResult] = await Promise.all([
    dynamo.send(new ScanCommand({ TableName: 'eigenthrope_universes' })),
    dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_chapters',
      ProjectionExpression: 'choice_point, universe, chapter, chapter_label, #s, voting_closes_at',
      ExpressionAttributeNames: { '#s': 'status' },
    })),
  ])

  const chapters = (chaptersResult.Items ?? []) as {
    choice_point: string
    universe: string
    chapter: string
    chapter_label: string
    status: string
    voting_closes_at?: string
  }[]

  const universes = ((universesResult.Items ?? []) as {
    universe_id: string
    title: string
    status: string
    completed_at?: string
  }[]).sort((a, b) => a.universe_id.localeCompare(b.universe_id))

  const result = universes.map(u => ({
    ...u,
    chapters: chapters
      .filter(c => c.universe === u.universe_id)
      .sort((a, b) => a.chapter.localeCompare(b.chapter)),
  }))

  return Response.json(result)
}

export async function PATCH(request: Request) {
  const { universe_id, title } = await request.json() as { universe_id: string; title: string }

  if (!universe_id || !title) {
    return Response.json({ error: 'universe_id and title are required' }, { status: 400 })
  }

  const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb')
  await dynamo.send(new UpdateCommand({
    TableName: 'eigenthrope_universes',
    Key: { universe_id: universe_id.toUpperCase() },
    UpdateExpression: 'SET title = :t',
    ExpressionAttributeValues: { ':t': title.trim() },
  }))

  return Response.json({ ok: true })
}

export async function POST(request: Request) {
  const { universe_id, title } = await request.json() as { universe_id: string; title: string }

  if (!universe_id || !title) {
    return Response.json({ error: 'universe_id and title are required' }, { status: 400 })
  }

  const id = universe_id.toUpperCase().trim()

  await dynamo.send(new PutCommand({
    TableName: 'eigenthrope_universes',
    Item: {
      universe_id: id,
      title: title.trim(),
      status: 'active',
      created_at: new Date().toISOString(),
    },
    ConditionExpression: 'attribute_not_exists(universe_id)',
  }))

  return Response.json({ ok: true, universe_id: id })
}
