import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'

export async function POST(request: Request) {
  const { universe_id, chapter_label, prompt, choices, voting_hours = 24 } =
    await request.json() as {
      universe_id: string
      chapter_label: string
      prompt: string
      choices: Record<string, { label: string; description: string }>
      voting_hours?: number
    }

  if (!universe_id || !chapter_label || !prompt || !choices) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (Object.keys(choices).length < 2) {
    return Response.json({ error: 'At least 2 choices are required' }, { status: 400 })
  }

  // Find next chapter number for this universe
  const existing = await dynamo.send(new ScanCommand({
    TableName: 'eigenthrope_chapters',
    FilterExpression: '#u = :uid',
    ExpressionAttributeNames: { '#u': 'universe' },
    ExpressionAttributeValues: { ':uid': universe_id.toUpperCase() },
    ProjectionExpression: 'chapter',
  }))

  const maxNum = (existing.Items ?? []).reduce((max, c) => {
    const n = parseInt((c.chapter as string).replace('C', '')) || 0
    return Math.max(max, n)
  }, 0)

  const nextNum = maxNum + 1
  const chapter = `C${String(nextNum).padStart(2, '0')}`
  const choice_point = `${universe_id.toUpperCase()}:${chapter}:CP1`
  const deadline = new Date(Date.now() + voting_hours * 60 * 60 * 1000).toISOString()

  await dynamo.send(new PutCommand({
    TableName: 'eigenthrope_chapters',
    Item: {
      choice_point,
      universe: universe_id.toUpperCase(),
      chapter,
      chapter_label: chapter_label.trim(),
      status: 'open',
      prompt: prompt.trim(),
      choices,
      voting_opens_at: new Date().toISOString(),
      voting_closes_at: deadline,
    },
  }))

  return Response.json({ ok: true, choice_point, chapter })
}
