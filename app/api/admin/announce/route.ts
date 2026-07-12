import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { announceChapter } from '@/lib/announce'

export async function POST() {
  const configItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_config',
    Key: { key: 'active_choice_point' },
  }))

  if (!configItem.Item) {
    return Response.json({ error: 'No active choice point' }, { status: 404 })
  }

  const choicePoint = configItem.Item.value as string
  const result = await announceChapter(choicePoint)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 404 })
  }

  return Response.json({ ok: true, choice_point: choicePoint })
}
