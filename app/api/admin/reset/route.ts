import { DeleteCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion, setResetVersion } from '@/lib/config'

export async function POST(request: Request) {
  const { voting_hours = 24 } = await request.json().catch(() => ({})) as { voting_hours?: number }

  const configItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_config',
    Key: { key: 'active_choice_point' },
  }))

  if (!configItem.Item) {
    return Response.json({ error: 'No active choice point' }, { status: 404 })
  }

  const choicePoint = configItem.Item.value as string
  const currentRv = await getResetVersion()
  const newRv = currentRv + 1

  const deadline = new Date(Date.now() + voting_hours * 60 * 60 * 1000).toISOString()

  await Promise.all([
    setResetVersion(newRv),
    dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_chapters',
      Key: { choice_point: choicePoint },
      UpdateExpression:
        'SET #s = :open, voting_closes_at = :deadline REMOVE closed_at, winning_choice, final_tally, final_yield_pct',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':open': 'open',
        ':deadline': deadline,
      },
    })),
    dynamo.send(new DeleteCommand({
      TableName: 'eigenthrope_tallies',
      Key: { choice_point: choicePoint },
    })),
  ])

  return Response.json({
    ok: true,
    reset_version: newRv,
    choice_point: choicePoint,
    voting_closes_at: deadline,
    winner_taxon: 1000 + newRv,
    participation_taxon: 2000 + newRv,
  })
}
