import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { postDiscord, chapterOpenedEmbed } from '@/lib/discord'
import { scheduleBotReaction } from '@/lib/botTriggers'
import type { ChapterData } from '@/app/api/chapter/route'

export async function POST() {
  const configItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_config',
    Key: { key: 'active_choice_point' },
  }))

  if (!configItem.Item) {
    return Response.json({ error: 'No active choice point' }, { status: 404 })
  }

  const choicePoint = configItem.Item.value as string

  const chapterItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_chapters',
    Key: { choice_point: choicePoint },
  }))

  const chapter = chapterItem.Item as ChapterData | undefined
  if (!chapter) {
    return Response.json({ error: 'Chapter not found' }, { status: 404 })
  }

  await postDiscord(chapterOpenedEmbed(
    chapter.universe ?? choicePoint.split(':')[0],
    chapter.chapter_label ?? choicePoint,
    chapter.prompt ?? '',
    chapter.choices ?? {},
    chapter.voting_closes_at,
  ))

  // Schedule the observer bots' in-character reaction (vesper_null in 2–4h)
  await scheduleBotReaction('episode_open')

  return Response.json({ ok: true, choice_point: choicePoint })
}
