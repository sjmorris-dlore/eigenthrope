import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo, fetchStoryText } from './aws.js'
import { CONFIG_TABLE, CHAPTERS_TABLE } from './config.js'

export interface Choice {
  label: string
  description: string
}

export interface ChapterRecord {
  choice_point: string
  universe: string
  chapter: string
  chapter_label: string
  status: 'open' | 'closed'
  prompt?: string
  choices?: Record<string, Choice>
  story_key?: string
  choice_intro_key?: string
  epilogue_key?: string
  choice_outcomes?: Record<string, string>
  winning_choice?: string
  voting_closes_at?: string
}

export interface GameContext {
  choicePoint: string // "U002:E01:CP1"
  universe: string
  chapter: string
  cp: string
  resetVersion: number
  record: ChapterRecord
  storyText: string
  /** Winning choice's outcome text, when closed */
  outcomeText?: string
  winningLabel?: string
}

async function getConfigValue(key: string): Promise<unknown> {
  const res = await dynamo.send(new GetCommand({ TableName: CONFIG_TABLE, Key: { key } }))
  return res.Item?.value
}

export async function getTestMode(): Promise<boolean> {
  return (await getConfigValue('test_mode')) === true
}

export async function getActiveChoicePoint(): Promise<string | null> {
  return ((await getConfigValue('active_choice_point')) as string | undefined) ?? null
}

export async function getResetVersion(): Promise<number> {
  const v = await getConfigValue('reset_version')
  return typeof v === 'number' ? v : 0
}

/**
 * Load the game context for a trigger. Episode-open posts react to the active
 * choice point; vote-close posts react to the just-closed (previous) one.
 *
 * Note: only player-visible data is loaded. The behavioral_profile config key
 * is internal scoring and must never be read here.
 */
export async function loadGameContext(which: 'active' | 'previous'): Promise<GameContext | null> {
  const key = which === 'active' ? 'active_choice_point' : 'previous_choice_point'
  const choicePoint = (await getConfigValue(key)) as string | undefined
  if (!choicePoint) return null

  const chapterRes = await dynamo.send(new GetCommand({
    TableName: CHAPTERS_TABLE,
    Key: { choice_point: choicePoint },
  }))
  const record = chapterRes.Item as ChapterRecord | undefined
  if (!record) return null

  const [universe, chapter, cp] = choicePoint.split(':')
  const resetVersion = await getResetVersion()

  const parts: string[] = []
  if (record.story_key) {
    const text = await fetchStoryText(record.story_key)
    if (text) parts.push(text)
  }
  if (record.choice_intro_key) {
    const intro = await fetchStoryText(record.choice_intro_key)
    if (intro) parts.push(intro)
  }

  let outcomeText: string | undefined
  let winningLabel: string | undefined
  if (record.status === 'closed' && record.winning_choice) {
    winningLabel = record.choices?.[record.winning_choice]?.label
    const outcomeKey = record.choice_outcomes?.[record.winning_choice]
    if (outcomeKey) outcomeText = (await fetchStoryText(outcomeKey)) ?? undefined
  }

  return {
    choicePoint,
    universe: record.universe ?? universe,
    chapter: record.chapter ?? chapter,
    cp,
    resetVersion,
    record,
    storyText: parts.join('\n\n'),
    outcomeText,
    winningLabel,
  }
}
