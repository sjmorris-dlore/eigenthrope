import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { fetchStoryText } from '@/lib/s3'
import type { ChapterData } from '@/app/api/chapter/route'

export async function GET() {
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

  const choiceOutcomeEntries = Object.entries(chapter.choice_outcomes ?? {})

  const [storyText, epilogueText, ...choiceTexts] = await Promise.all([
    chapter.story_key ? fetchStoryText(chapter.story_key) : Promise.resolve(null),
    chapter.epilogue_key ? fetchStoryText(chapter.epilogue_key) : Promise.resolve(null),
    ...choiceOutcomeEntries.map(([, key]) => fetchStoryText(key)),
  ])

  const choice_outcome_texts: Record<string, string> = {}
  choiceOutcomeEntries.forEach(([id], i) => {
    if (choiceTexts[i]) choice_outcome_texts[id] = choiceTexts[i]!
  })

  return Response.json({
    story_text: storyText ?? null,
    choice_outcome_texts,
    epilogue_text: epilogueText ?? null,
  })
}
