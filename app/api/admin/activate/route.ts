import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'

export async function POST(request: Request) {
  const { choice_point } = await request.json() as { choice_point: string }

  if (!choice_point) {
    return Response.json({ error: 'choice_point is required' }, { status: 400 })
  }

  const newUniverseId = choice_point.split(':')[0]

  // Read existing active chapter before overwriting
  const existing = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_config',
    Key: { key: 'active_choice_point' },
  }))
  const previousUniverseId = (existing.Item?.value as string | undefined)?.split(':')[0]

  const ops: Promise<unknown>[] = [
    dynamo.send(new PutCommand({
      TableName: 'eigenthrope_config',
      Item: { key: 'active_choice_point', value: choice_point },
    })),

    // Reopen the chapter and clear any stale close state from a prior round
    dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_chapters',
      Key: { choice_point },
      UpdateExpression: 'SET #s = :open REMOVE winning_choice, final_tally',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':open': 'open' },
    })),

    // Ensure the universe is marked active
    dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_universes',
      Key: { universe_id: newUniverseId },
      UpdateExpression: 'SET #s = :active REMOVE completed_at',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':active': 'active' },
    })),
  ]

  // If switching to a different universe, mark the old one as completed
  if (previousUniverseId && previousUniverseId !== newUniverseId) {
    ops.push(dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_universes',
      Key: { universe_id: previousUniverseId },
      UpdateExpression: 'SET #s = :completed, completed_at = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':completed': 'completed',
        ':now': new Date().toISOString(),
      },
    })))
  }

  await Promise.all(ops)

  return Response.json({ ok: true, active_choice_point: choice_point })
}
