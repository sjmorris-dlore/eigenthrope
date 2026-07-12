import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { activateChoicePoint } from '@/lib/activate'

/**
 * Move the game to the next episode in sequence. Deliberately a manual admin
 * action (not part of closing): the gap between close and advance is where
 * NFTs get minted and distributed, so weights are settled before the next
 * vote opens. Anchored on previous_choice_point (set at close), which makes
 * a double-click idempotent — it re-resolves to the same next chapter.
 */
export async function POST() {
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

  return Response.json({
    ok: true,
    advanced_from: previousChoicePoint,
    active_choice_point: nextChapter.choice_point,
  })
}
