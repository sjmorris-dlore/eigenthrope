import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'

export async function POST(request: Request) {
  const { choice_point } = await request.json() as { choice_point: string }

  if (!choice_point) {
    return Response.json({ error: 'choice_point is required' }, { status: 400 })
  }

  await dynamo.send(new PutCommand({
    TableName: 'eigenthrope_config',
    Item: { key: 'active_choice_point', value: choice_point },
  }))

  return Response.json({ ok: true, active_choice_point: choice_point })
}
