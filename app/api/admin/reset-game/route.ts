import { DeleteCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion, setResetVersion } from '@/lib/config'

export async function POST() {
  const currentRv = await getResetVersion()
  const newRv = currentRv + 1

  const [tallies, chapters, universes, minting, artifacts] = await Promise.all([
    dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_tallies',
      ProjectionExpression: 'choice_point',
    })),
    dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_chapters',
      ProjectionExpression: 'choice_point',
    })),
    dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_universes',
      ProjectionExpression: 'universe_id',
    })),
    dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_minting',
      ProjectionExpression: 'nft_token_id',
    })),
    dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_artifacts',
      ProjectionExpression: 'offer_id',
    })),
  ])

  const allChapters = (chapters.Items ?? []) as { choice_point: string }[]
  const allUniverses = (universes.Items ?? []) as { universe_id: string }[]

  // First chapter alphabetically becomes the new active choice point
  const firstChoicePoint = allChapters
    .map(c => c.choice_point)
    .sort()[0] as string | undefined

  await Promise.all([
    setResetVersion(newRv),

    // Delete all tally caches
    ...(tallies.Items ?? []).map(item =>
      dynamo.send(new DeleteCommand({
        TableName: 'eigenthrope_tallies',
        Key: { choice_point: item.choice_point },
      }))
    ),

    // Delete all minting records so idempotency keys don't block re-mints
    ...(minting.Items ?? []).map(item =>
      dynamo.send(new DeleteCommand({
        TableName: 'eigenthrope_minting',
        Key: { nft_token_id: item.nft_token_id },
      }))
    ),

    // Delete all artifact offer records
    ...(artifacts.Items ?? []).map(item =>
      dynamo.send(new DeleteCommand({
        TableName: 'eigenthrope_artifacts',
        Key: { offer_id: item.offer_id },
      }))
    ),

    // Reopen all chapters — clear closed state and any prior round's results
    ...allChapters.map(item =>
      dynamo.send(new UpdateCommand({
        TableName: 'eigenthrope_chapters',
        Key: { choice_point: item.choice_point },
        UpdateExpression: 'SET #s = :open REMOVE winning_choice, final_tally',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':open': 'open' },
      }))
    ),

    // Mark all universes active
    ...allUniverses.map(item =>
      dynamo.send(new UpdateCommand({
        TableName: 'eigenthrope_universes',
        Key: { universe_id: item.universe_id },
        UpdateExpression: 'SET #s = :active REMOVE completed_at',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':active': 'active' },
      }))
    ),

    // Auto-activate first chapter
    firstChoicePoint
      ? dynamo.send(new PutCommand({
          TableName: 'eigenthrope_config',
          Item: { key: 'active_choice_point', value: firstChoicePoint },
        }))
      : dynamo.send(new UpdateCommand({
          TableName: 'eigenthrope_config',
          Key: { key: 'active_choice_point' },
          UpdateExpression: 'REMOVE #v',
          ExpressionAttributeNames: { '#v': 'value' },
        })),

    // Clear previous chapter so the conclusion card doesn't show after reset
    dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'previous_choice_point' },
      UpdateExpression: 'REMOVE #v',
      ExpressionAttributeNames: { '#v': 'value' },
    })),
  ])

  return Response.json({
    ok: true,
    reset_version: newRv,
    active_choice_point: firstChoicePoint ?? null,
    winner_taxon: 1000 + newRv,
    participation_taxon: 2000 + newRv,
  })
}
