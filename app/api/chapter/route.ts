import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { fetchStoryText } from '@/lib/s3'
import type { BehavioralWeights, BehavioralProfile } from '@/lib/behavioral'
import { resolveConditionals } from '@/lib/conditional'

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
  choice_outcomes?: Record<string, string>  // { A: 'U001/E01/outcome_A.md', ... }
  epilogue_key?: string
  winning_choice?: string
  final_tally?: Record<string, number>
  /** Close-time per-voter weights — the mint winner tier sorts by these */
  final_weights?: Record<string, number>
  final_yield_pct?: number
  winner_nft_uri?: string
  participation_nft_uri?: string
  participation_image_key?: string
  winner_image_key?: string
  author_link_url?: string
  author_link_label?: string
  // Populated server-side from S3, not stored in DB
  story_text?: string
  choice_intro_text?: string
  outcome_text?: string  // winning choice's outcome, only set when closed
  epilogue_text?: string  // only set when closed
  predecessor?: {
    choice_point: string
    chapter_label: string
    winning_choice_label: string | null
    outcome_text: string | null
    epilogue_text: string | null
  }
}

export async function GET() {
  const [configItem, prevConfigItem] = await Promise.all([
    dynamo.send(new GetCommand({ TableName: 'eigenthrope_config', Key: { key: 'active_choice_point' } })),
    dynamo.send(new GetCommand({ TableName: 'eigenthrope_config', Key: { key: 'previous_choice_point' } })),
  ])

  if (!configItem.Item) {
    return Response.json({ error: 'No active choice point' }, { status: 404 })
  }

  const choicePoint = configItem.Item.value as string
  const prevChoicePoint = prevConfigItem.Item?.value as string | undefined

  const [chapterItem, prevChapterItem] = await Promise.all([
    dynamo.send(new GetCommand({ TableName: 'eigenthrope_chapters', Key: { choice_point: choicePoint } })),
    prevChoicePoint
      ? dynamo.send(new GetCommand({ TableName: 'eigenthrope_chapters', Key: { choice_point: prevChoicePoint } }))
      : Promise.resolve(null),
  ])

  if (!chapterItem.Item) {
    return Response.json({ error: 'Chapter not found' }, { status: 404 })
  }

  const chapter = chapterItem.Item as ChapterData
  const prevChapter = prevChapterItem?.Item as ChapterData | undefined

  const winningOutcomeKey = chapter.winning_choice
    ? chapter.choice_outcomes?.[chapter.winning_choice]
    : undefined
  const prevWinningOutcomeKey = prevChapter?.winning_choice
    ? prevChapter.choice_outcomes?.[prevChapter.winning_choice]
    : undefined

  const [profileItem, storyText, choiceIntroText, outcomeText, epilogueText, prevOutcomeText, prevEpilogueText] = await Promise.all([
    dynamo.send(new GetCommand({ TableName: 'eigenthrope_config', Key: { key: 'behavioral_profile' } })),
    chapter.story_key ? fetchStoryText(chapter.story_key) : Promise.resolve(null),
    chapter.choice_intro_key ? fetchStoryText(chapter.choice_intro_key) : Promise.resolve(null),
    winningOutcomeKey ? fetchStoryText(winningOutcomeKey) : Promise.resolve(null),
    chapter.epilogue_key ? fetchStoryText(chapter.epilogue_key) : Promise.resolve(null),
    prevWinningOutcomeKey ? fetchStoryText(prevWinningOutcomeKey) : Promise.resolve(null),
    prevChapter?.epilogue_key ? fetchStoryText(prevChapter.epilogue_key) : Promise.resolve(null),
  ])

  const profile = (profileItem.Item?.value ?? {}) as Partial<BehavioralProfile>
  const resolve = (t: string | null) => t ? resolveConditionals(t, profile) : undefined

  const predecessor = prevChapter ? {
    choice_point: prevChoicePoint!,
    chapter_label: prevChapter.chapter_label,
    winning_choice_label: prevChapter.winning_choice
      ? (prevChapter.choices?.[prevChapter.winning_choice]?.label ?? null)
      : null,
    outcome_text: resolve(prevOutcomeText) ?? null,
    epilogue_text: resolve(prevEpilogueText) ?? null,
  } : undefined

  return Response.json({
    ...chapter,
    story_text: resolve(storyText),
    choice_intro_text: resolve(choiceIntroText),
    outcome_text: resolve(outcomeText),
    epilogue_text: resolve(epilogueText),
    predecessor,
  })
}
