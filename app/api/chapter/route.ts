import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { fetchStoryText } from '@/lib/s3'
import type { BehavioralWeights } from '@/lib/behavioral'

export interface Choice {
  label: string
  description: string
  behavioral_weights?: BehavioralWeights
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
  choice_intro_key?: string
  choice_outcomes?: Record<string, string>  // { A: 'U001/C01/outcome_A.md', ... }
  epilogue_key?: string
  winning_choice?: string
  final_tally?: Record<string, number>
  final_yield_pct?: number
  winner_nft_uri?: string
  participation_nft_uri?: string
  participation_image_key?: string
  winner_image_key?: string
  // Populated server-side from S3, not stored in DB
  story_text?: string
  choice_intro_text?: string
  outcome_text?: string  // winning choice's outcome, only set when closed
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

  const winningOutcomeKey = chapter.winning_choice
    ? chapter.choice_outcomes?.[chapter.winning_choice]
    : undefined

  const [storyText, choiceIntroText, outcomeText] = await Promise.all([
    chapter.story_key ? fetchStoryText(chapter.story_key) : Promise.resolve(null),
    chapter.choice_intro_key ? fetchStoryText(chapter.choice_intro_key) : Promise.resolve(null),
    winningOutcomeKey ? fetchStoryText(winningOutcomeKey) : Promise.resolve(null),
  ])

  return Response.json({
    ...chapter,
    story_text: storyText ?? undefined,
    choice_intro_text: choiceIntroText ?? undefined,
    outcome_text: outcomeText ?? undefined,
  })
}
