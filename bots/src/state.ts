import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from './aws.js'
import { CONFIG_TABLE } from './config.js'
import type { CharacterName } from './characters.js'

export type TriggerKind =
  | 'episode_open'
  | 'vote_close'
  | 'game_reset'
  | 'peer_posted'
  | 'vesper_posted' // legacy name for peer_posted — read-only, never written
  | 'mention'
  | 'idle'
  | 'theory'

export interface PendingPost {
  scheduled_for: string // ISO timestamp
  trigger: TriggerKind
  /** For peer_posted: the text of the post being responded to; for idle: variant hint */
  context?: string
  /** Which choice point the post reacts to: the open one or the just-closed one */
  game_which?: 'active' | 'previous'
  /** Target Discord channel — defaults to the story channel */
  channel?: 'story' | 'theories'
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
  /**
   * Pending posts keyed by trigger, so a vote_close commentary and the next
   * episode_open reaction can both be in flight — different triggers never
   * clobber each other; re-firing the same trigger replaces its own slot.
   */
  pending_posts?: Partial<Record<TriggerKind, PendingPost>>
  /** Legacy single-slot field — read for migration, never written */
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
  // trigger routes create it with only a pending post via UpdateCommand SET.
  const item = res.Item as Partial<CharacterState> | undefined
  return {
    key: stateKey(name),
    working_theory: item?.working_theory ?? '',
    post_history: item?.post_history ?? [],
    history_summary: item?.history_summary,
    last_posted_at: item?.last_posted_at,
    pending_posts: item?.pending_posts,
    pending_post: item?.pending_post,
    last_voted: item?.last_voted,
  }
}

/** All in-flight pending posts, folding in the legacy single-slot field. */
export function allPendingPosts(state: CharacterState): PendingPost[] {
  const fromMap = Object.values(state.pending_posts ?? {}).filter((p): p is PendingPost => Boolean(p))
  return state.pending_post ? [...fromMap, state.pending_post] : fromMap
}

/**
 * Persist the fields the post pipeline owns. Deliberately NOT a whole-item
 * Put: pending_posts can be written by the Next.js trigger routes while a
 * post is being generated, and a Put would silently clobber that.
 */
export async function saveCharacterState(state: CharacterState): Promise<void> {
  await dynamo.send(new UpdateCommand({
    TableName: CONFIG_TABLE,
    Key: { key: state.key },
    UpdateExpression:
      'SET working_theory = :wt, post_history = :ph, last_posted_at = :lp' +
      (state.history_summary !== undefined ? ', history_summary = :hs' : '') +
      (state.last_voted !== undefined ? ', last_voted = :lv' : ''),
    ExpressionAttributeValues: {
      ':wt': state.working_theory,
      ':ph': state.post_history,
      ':lp': state.last_posted_at,
      ...(state.history_summary !== undefined ? { ':hs': state.history_summary } : {}),
      ...(state.last_voted !== undefined ? { ':lv': state.last_voted } : {}),
    },
  }))
}

/**
 * Atomically claim a due pending post: removes its trigger slot only if
 * `scheduled_for` still matches, so a concurrent worker (or restart race)
 * can't double-post. Returns true if this process won the claim.
 * Handles both the per-trigger map and the legacy single-slot field.
 */
export async function claimPendingPost(name: CharacterName, pending: PendingPost, isLegacy: boolean): Promise<boolean> {
  try {
    if (isLegacy) {
      await dynamo.send(new UpdateCommand({
        TableName: CONFIG_TABLE,
        Key: { key: stateKey(name) },
        UpdateExpression: 'REMOVE pending_post',
        ConditionExpression: 'pending_post.scheduled_for = :sf',
        ExpressionAttributeValues: { ':sf': pending.scheduled_for },
      }))
    } else {
      await dynamo.send(new UpdateCommand({
        TableName: CONFIG_TABLE,
        Key: { key: stateKey(name) },
        UpdateExpression: 'REMOVE pending_posts.#t',
        ConditionExpression: 'pending_posts.#t.scheduled_for = :sf',
        ExpressionAttributeNames: { '#t': pending.trigger },
        ExpressionAttributeValues: { ':sf': pending.scheduled_for },
      }))
    }
    return true
  } catch {
    return false
  }
}

/**
 * Schedule a character's pending post in its trigger's slot. Two-step update:
 * the map must exist before a nested SET can target a key inside it.
 */
export async function schedulePendingPost(name: CharacterName, pending: PendingPost): Promise<void> {
  await dynamo.send(new UpdateCommand({
    TableName: CONFIG_TABLE,
    Key: { key: stateKey(name) },
    UpdateExpression: 'SET pending_posts = if_not_exists(pending_posts, :empty)',
    ExpressionAttributeValues: { ':empty': {} },
  }))
  await dynamo.send(new UpdateCommand({
    TableName: CONFIG_TABLE,
    Key: { key: stateKey(name) },
    UpdateExpression: 'SET pending_posts.#t = :p',
    ExpressionAttributeNames: { '#t': pending.trigger },
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
