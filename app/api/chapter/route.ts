import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { fetchStoryText } from '@/lib/s3'

export interface Choice {
  label: string
  description: string
}

export interface ChapterData {
  choice_point: string
  universe: string
  chapter: string
  chapter_label: string
  status: 'open' | 'closed'
  prompt: string
  choices: Record<string, Choice>
  voting_opens_at: string
  voting_closes_at: string
  next_chapter_due_at: string
  story_key?: string
  outcome_key?: string
  winning_choice?: string
  final_tally?: Record<string, number>
  // Populated server-side from S3, not stored in DB
  story_text?: string
  outcome_text?: string
}

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

  if (!chapterItem.Item) {
    return Response.json({ error: 'Chapter not found' }, { status: 404 })
  }

  const chapter = chapterItem.Item as ChapterData

  const [storyText, outcomeText] = await Promise.all([
    chapter.story_key ? fetchStoryText(chapter.story_key) : Promise.resolve(null),
    chapter.outcome_key ? fetchStoryText(chapter.outcome_key) : Promise.resolve(null),
  ])

  return Response.json({
    ...chapter,
    story_text: storyText ?? undefined,
    outcome_text: outcomeText ?? undefined,
  })
}
