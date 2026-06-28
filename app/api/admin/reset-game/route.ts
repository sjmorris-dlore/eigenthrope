import { DeleteCommand, GetCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion, setResetVersion } from '@/lib/config'

export async function POST() {
  const currentRv = await getResetVersion()
  const newRv = currentRv + 1

  // Find which universe is active so we can mark it completed
  const [tallies, activeConfig] = await Promise.all([
    dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_tallies',
      ProjectionExpression: 'choice_point',
    })),
    dynamo.send(new GetCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'active_choice_point' },
    })),
  ])

  const activeChoicePoint = activeConfig.Item?.value as string | undefined
  const universeId = activeChoicePoint?.split(':')[0]

  await Promise.all([
    setResetVersion(newRv),

    // Clear active chapter so site goes dormant
    dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'active_choice_point' },
      UpdateExpression: 'REMOVE #v',
      ExpressionAttributeNames: { '#v': 'value' },
    })),

    // Mark the active universe as completed so it appears in the archive
    ...(universeId ? [dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_universes',
      Key: { universe_id: universeId },
      UpdateExpression: 'SET #s = :completed, completed_at = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':completed': 'completed', ':now': new Date().toISOString() },
    }))] : []),

    // Delete all tally caches
    ...(tallies.Items ?? []).map(item =>
      dynamo.send(new DeleteCommand({
        TableName: 'eigenthrope_tallies',
        Key: { choice_point: item.choice_point },
      }))
    ),
  ])

  return Response.json({
    ok: true,
    reset_version: newRv,
    winner_taxon: 1000 + newRv,
    participation_taxon: 2000 + newRv,
  })
}
