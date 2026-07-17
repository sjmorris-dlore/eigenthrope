import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getTestMode } from '@/lib/config'

// Mirrors bots/src/state.ts PendingPost. A randomly chosen observer reacts
// first; the bot process itself chains the others' responses afterwards.
const INITIATOR_DELAY_MS_PROD: [number, number] = [2 * 3600_000, 4 * 3600_000] // 2–4h
const INITIATOR_DELAY_MS_TEST: [number, number] = [60_000, 180_000] // 1–3min, for the admin test-mode toggle

type BotTrigger = 'episode_open' | 'vote_close' | 'game_reset'

/** Admin pace lever (config key bot_pace): delays ×pace. Mirrors bots/src/story.ts getBotPace. */
async function getBotPace(): Promise<number> {
  try {
    const result = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'bot_pace' },
    }))
    const v = result.Item?.value
    const n = typeof v === 'number' ? v : 1
    return Math.min(10, Math.max(0.25, n))
  } catch {
    return 1
  }
}

/** Roster names, from the bot_addresses map the bot process publishes at startup. */
async function getBotNames(): Promise<string[]> {
  try {
    const result = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'bot_addresses' },
    }))
    const value = result.Item?.value
    if (typeof value !== 'object' || value === null) return []
    return Object.keys(value as Record<string, string>)
  } catch {
    return []
  }
}

/**
 * Schedule a bot's reaction post by writing a pending_post record to its
 * character state item. The Fly.io bot process polls these and executes when
 * due — this survives restarts on both sides. Never throws: bot scheduling
 * must not break the admin flow.
 */
export async function scheduleBotReaction(trigger: BotTrigger): Promise<void> {
  try {
    const [testMode, names, pace] = await Promise.all([getTestMode(), getBotNames(), getBotPace()])
    const initiator = names.length > 0
      ? names[Math.floor(Math.random() * names.length)]
      : 'vesper_null' // roster not published yet — fall back to a known bot

    const [min, max] = testMode ? INITIATOR_DELAY_MS_TEST : INITIATOR_DELAY_MS_PROD
    const delay = (min + Math.floor(Math.random() * (max - min))) * pace
    const pending = {
      scheduled_for: new Date(Date.now() + delay).toISOString(),
      trigger,
      game_which: trigger === 'vote_close' ? 'previous' : 'active',
      channel: 'story',
    }

    // Per-trigger slot: a vote_close commentary and the next episode_open
    // reaction can both be in flight without clobbering each other.
    // Two-step: the map must exist before a nested SET can target a key.
    const key = `character:${initiator}`
    await dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_config',
      Key: { key },
      UpdateExpression: 'SET pending_posts = if_not_exists(pending_posts, :empty)',
      ExpressionAttributeValues: { ':empty': {} },
    }))
    await dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_config',
      Key: { key },
      UpdateExpression: 'SET pending_posts.#t = :p',
      ExpressionAttributeNames: { '#t': trigger },
      ExpressionAttributeValues: { ':p': pending },
    }))
    console.log(`[botTriggers] scheduled ${initiator} ${trigger} reaction for ${pending.scheduled_for}${testMode ? ' (test mode)' : ''}`)
  } catch (err) {
    console.error('[botTriggers] failed to schedule bot reaction:', err)
  }
}
