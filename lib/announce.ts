import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { postDiscord, chapterOpenedEmbed } from '@/lib/discord'
import { scheduleBotReaction } from '@/lib/botTriggers'
import type { ChapterData } from '@/app/api/chapter/route'

/**
 * Announce a chapter: Discord embed with prompt/choices/deadline, plus the
 * observer bots' episode-open reaction. Shared by /api/admin/announce
 * (standalone: first episode, post-reset, re-announce) and
 * /api/admin/advance (part of the normal close→mint→advance cycle).
 */
export async function announceChapter(choicePoint: string): Promise<{ ok: boolean; error?: string }> {
  const chapterItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_chapters',
    Key: { choice_point: choicePoint },
  }))

  const chapter = chapterItem.Item as ChapterData | undefined
  if (!chapter) return { ok: false, error: 'Chapter not found' }

  await postDiscord(chapterOpenedEmbed(
    chapter.universe ?? choicePoint.split(':')[0],
    chapter.chapter_label ?? choicePoint,
    chapter.prompt ?? '',
    chapter.choices ?? {},
    chapter.voting_closes_at,
  ))

  await scheduleBotReaction('episode_open')

  return { ok: true }
}
