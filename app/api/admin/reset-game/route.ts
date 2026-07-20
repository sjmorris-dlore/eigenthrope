import { DeleteCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion, setResetVersion } from '@/lib/config'
import { postDiscord, gameResetEmbed } from '@/lib/discord'
import { scheduleBotReaction } from '@/lib/botTriggers'

export async function POST() {
  const currentRv = await getResetVersion()
  const newRv = currentRv + 1

  const [tallies, chapters, universes, minting, artifacts, seals] = await Promise.all([
    dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_tallies',
      ProjectionExpression: 'choice_point',
    })),
    dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_chapters',
      ProjectionExpression: 'choice_point, voting_opens_at, voting_closes_at',
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
    dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_seals',
      ProjectionExpression: 'seal_id',
    })),
  ])

  const allChapters = (chapters.Items ?? []) as {
    choice_point: string
    voting_opens_at?: string
    voting_closes_at?: string
  }[]
  const allUniverses = (universes.Items ?? []) as { universe_id: string }[]

  const DEFAULT_VOTING_HOURS = 24
  const now = Date.now()

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

    // Delete all sealed observations — the Record persists across universes
    // and episodes WITHIN an iteration, but a total game reset restarts the
    // story itself; theories about the previous playthrough don't carry over.
    ...(seals.Items ?? []).map(item =>
      dynamo.send(new DeleteCommand({
        TableName: 'eigenthrope_seals',
        Key: { seal_id: item.seal_id },
      }))
    ),

    // Reopen all chapters — clear closed state and any prior round's results,
    // and re-anchor the voting window to right now. Without this, a chapter's
    // original voting_opens_at/voting_closes_at (set whenever it was first
    // created, possibly weeks ago) would survive the reset untouched — and
    // since status goes back to 'open', the close-choice-point cron would
    // see a deadline already in the past and auto-close the freshly-reset
    // vote before anyone gets to cast one. Each chapter keeps whatever
    // voting DURATION it was last configured with (closes − opens), just
    // measured from now instead of its original creation time.
    ...allChapters.map(item => {
      const openedAt = item.voting_opens_at ? new Date(item.voting_opens_at).getTime() : NaN
      const closedAt = item.voting_closes_at ? new Date(item.voting_closes_at).getTime() : NaN
      const durationMs = Number.isFinite(openedAt) && Number.isFinite(closedAt) && closedAt > openedAt
        ? closedAt - openedAt
        : DEFAULT_VOTING_HOURS * 3600_000
      return dynamo.send(new UpdateCommand({
        TableName: 'eigenthrope_chapters',
        Key: { choice_point: item.choice_point },
        UpdateExpression: 'SET #s = :open, voting_opens_at = :vo, voting_closes_at = :vc REMOVE winning_choice, final_tally, final_weights',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':open': 'open',
          ':vo': new Date(now).toISOString(),
          ':vc': new Date(now + durationMs).toISOString(),
        },
      }))
    }),

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

  await postDiscord(gameResetEmbed(
    'full',
    firstChoicePoint
      ? `The story has been reset back to the beginning. Voting is open again on **${firstChoicePoint}**.`
      : 'The story has been reset back to the beginning.'
  ))

  // Let the observer bots know the game reset so they react and vote again
  if (firstChoicePoint) await scheduleBotReaction('game_reset')

  return Response.json({
    ok: true,
    reset_version: newRv,
    active_choice_point: firstChoicePoint ?? null,
    winner_taxon: 1000 + newRv,
    participation_taxon: 2000 + newRv,
  })
}
