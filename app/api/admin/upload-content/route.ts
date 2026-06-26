import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { putStoryText } from '@/lib/s3'

export async function POST(request: Request) {
  const { choice_point, type, content } = await request.json() as {
    choice_point: string
    type: 'story' | 'outcome'
    content: string
  }

  if (!choice_point || !type || !content) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (type !== 'story' && type !== 'outcome') {
    return Response.json({ error: 'type must be story or outcome' }, { status: 400 })
  }

  // U001:C01:CP1 → U001/C01/story.md
  const [universe, chapter] = choice_point.split(':')
  const s3Key = `${universe}/${chapter}/${type}.md`

  await putStoryText(s3Key, content)

  const dbField = type === 'story' ? 'story_key' : 'outcome_key'

  await dynamo.send(new UpdateCommand({
    TableName: 'eigenthrope_chapters',
    Key: { choice_point },
    UpdateExpression: `SET ${dbField} = :key`,
    ExpressionAttributeValues: { ':key': s3Key },
  }))

  return Response.json({ ok: true, s3_key: s3Key })
}
