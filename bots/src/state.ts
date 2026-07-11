import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from './aws.js'
import { CONFIG_TABLE } from './config.js'
import type { CharacterName } from './characters.js'

export type TriggerKind = 'episode_open' | 'vote_close' | 'vesper_posted' | 'mention' | 'game_reset'

export interface PendingPost {
  scheduled_for: string // ISO timestamp
  trigger: TriggerKind
  /** For vesper_posted: the text of the post being responded to */
  context?: string
  /** Which choice point the post reacts to: the open one or the just-closed one */
  game_which?: 'active' | 'previous'
}

export interface PostRecord {
  text: string
  at: string
  trigger: TriggerKind
}

export interface CharacterState {
  key: string
  working_theory: string
  post_history: PostRecord[]
  /** Rolling paragraph summarising posts older than the verbatim window */
  history_summary?: string
  last_posted_at?: string
  pending_post?: PendingPost
  /** `${choice_point}:rv${reset_version}` of the last vote, to avoid double-voting */
  last_voted?: string
}

const stateKey = (name: CharacterName) => `character:${name}`

export async function getCharacterState(name: CharacterName): Promise<CharacterState> {
  const res = await dynamo.send(new GetCommand({
    TableName: CONFIG_TABLE,
    Key: { key: stateKey(name) },
  }))
  // Normalize per-field: the item may exist but be partial — the Next.js
  // trigger routes create it with only pending_post via UpdateCommand SET.
  const item = res.Item as Partial<CharacterState> | undefined
  return {
    key: stateKey(name),
    working_theory: item?.working_theory ?? '',
    post_history: item?.post_history ?? [],
    history_summary: item?.history_summary,
    last_posted_at: item?.last_posted_at,
    pending_post: item?.pending_post,
    last_voted: item?.last_voted,
  }
}

export async function saveCharacterState(state: CharacterState): Promise<void> {
  await dynamo.send(new PutCommand({ TableName: CONFIG_TABLE, Item: state }))
}

/**
 * Atomically claim a due pending post: removes it only if `scheduled_for`
 * still matches, so a concurrent worker (or restart race) can't double-post.
 * Returns true if this process won the claim.
 */
export async function claimPendingPost(name: CharacterName, scheduledFor: string): Promise<boolean> {
  try {
    await dynamo.send(new UpdateCommand({
      TableName: CONFIG_TABLE,
      Key: { key: stateKey(name) },
      UpdateExpression: 'REMOVE pending_post',
      ConditionExpression: 'pending_post.scheduled_for = :sf',
      ExpressionAttributeValues: { ':sf': scheduledFor },
    }))
    return true
  } catch {
    return false
  }
}

/** Schedule (or replace) a character's pending post. */
export async function schedulePendingPost(name: CharacterName, pending: PendingPost): Promise<void> {
  await dynamo.send(new UpdateCommand({
    TableName: CONFIG_TABLE,
    Key: { key: stateKey(name) },
    UpdateExpression: 'SET pending_post = :p',
    ExpressionAttributeValues: { ':p': pending },
  }))
}

// Post-history windowing: keep the last 50 verbatim; when exceeded, the oldest
// 25 are summarised into history_summary (summarisation happens in claude.ts —
// this just reports what needs summarising).
export const HISTORY_VERBATIM_MAX = 50
export const HISTORY_SUMMARISE_BATCH = 25

export function postsToSummarise(state: CharacterState): PostRecord[] {
  if (state.post_history.length <= HISTORY_VERBATIM_MAX) return []
  return state.post_history.slice(0, HISTORY_SUMMARISE_BATCH)
}
