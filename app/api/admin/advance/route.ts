import { GetCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { activateChoicePoint } from '@/lib/activate'
import { announceChapter } from '@/lib/announce'

/**
 * Move the game to the next episode in sequence: activate it, stamp a fresh
 * voting deadline (voting opens NOW — the one set at chapter creation is
 * stale by advance time), and announce it (Discord embed + bot reactions).
 * Deliberately a manual admin action (not part of closing): the gap between
 * close and advance is where NFTs get minted and distributed, so weights are
 * settled before the next vote opens. Anchored on previous_choice_point
 * (set at close), which makes a double-click idempotent.
 */
export async function POST(request: Request) {
  const { voting_hours = 24 } = await request.json().catch(() => ({})) as { voting_hours?: number }
  const prevItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_config',
    Key: { key: 'previous_choice_point' },
  }))
  const previousChoicePoint = prevItem.Item?.value as string | undefined
  if (!previousChoicePoint) {
    return Response.json({ error: 'No previous_choice_point — close an episode first.' }, { status: 409 })
  }

  // Same ordering the old auto-advance used: chapter, then universe
  const allChaptersResult = await dynamo.send(new ScanCommand({
    TableName: 'eigenthrope_chapters',
    ProjectionExpression: 'choice_point, #u, chapter',
    ExpressionAttributeNames: { '#u': 'universe' },
  }))
  const allChapters = (allChaptersResult.Items ?? []) as { choice_point: string; universe: string; chapter: string }[]
  const sorted = allChapters.sort((a, b) => {
    const c = a.chapter.localeCompare(b.chapter)
    return c !== 0 ? c : a.universe.localeCompare(b.universe)
  })

  const currentIdx = sorted.findIndex(c => c.choice_point === previousChoicePoint)
  if (currentIdx === -1) {
    return Response.json({ error: `previous_choice_point ${previousChoicePoint} not found among chapters` }, { status: 500 })
  }
  const nextChapter = currentIdx < sorted.length - 1 ? sorted[currentIdx + 1] : null
  if (!nextChapter) {
    return Response.json({ error: 'No next chapter — this was the last episode in sequence.' }, { status: 409 })
  }

  await activateChoicePoint(nextChapter.choice_point)

  const deadline = new Date(Date.now() + voting_hours * 60 * 60 * 1000).toISOString()
  await dynamo.send(new UpdateCommand({
    TableName: 'eigenthrope_chapters',
    Key: { choice_point: nextChapter.choice_point },
    UpdateExpression: 'SET voting_closes_at = :deadline',
    ExpressionAttributeValues: { ':deadline': deadline },
  }))

  const announced = await announceChapter(nextChapter.choice_point)

  return Response.json({
    ok: true,
    advanced_from: previousChoicePoint,
    active_choice_point: nextChapter.choice_point,
    voting_closes_at: deadline,
    announced: announced.ok,
  })
}
