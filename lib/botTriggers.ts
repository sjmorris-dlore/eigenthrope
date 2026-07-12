import { UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getTestMode } from '@/lib/config'

// Mirrors bots/src/state.ts PendingPost. vesper_null posts first on all three
// events; the bot process itself chains amber_drift's response afterwards.
const VESPER_DELAY_MS_PROD: [number, number] = [2 * 3600_000, 4 * 3600_000] // 2–4h
const VESPER_DELAY_MS_TEST: [number, number] = [60_000, 180_000] // 1–3min, for the admin test-mode toggle

type BotTrigger = 'episode_open' | 'vote_close' | 'game_reset'

/**
 * Schedule vesper_null's reaction post by writing a pending_post record to her
 * character state item. The Fly.io bot process polls these and executes when
 * due — this survives restarts on both sides. Never throws: bot scheduling
 * must not break the admin flow.
 */
export async function scheduleBotReaction(trigger: BotTrigger): Promise<void> {
  const testMode = await getTestMode()
  const [min, max] = testMode ? VESPER_DELAY_MS_TEST : VESPER_DELAY_MS_PROD
  const delay = min + Math.floor(Math.random() * (max - min))
  const pending = {
    scheduled_for: new Date(Date.now() + delay).toISOString(),
    trigger,
    game_which: trigger === 'vote_close' ? 'previous' : 'active',
  }
  try {
    // Per-trigger slot: a vote_close commentary and the next episode_open
    // reaction can both be in flight without clobbering each other.
    // Two-step: the map must exist before a nested SET can target a key.
    await dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'character:vesper_null' },
      UpdateExpression: 'SET pending_posts = if_not_exists(pending_posts, :empty)',
      ExpressionAttributeValues: { ':empty': {} },
    }))
    await dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'character:vesper_null' },
      UpdateExpression: 'SET pending_posts.#t = :p',
      ExpressionAttributeNames: { '#t': trigger },
      ExpressionAttributeValues: { ':p': pending },
    }))
    console.log(`[botTriggers] scheduled vesper_null ${trigger} reaction for ${pending.scheduled_for}${testMode ? ' (test mode)' : ''}`)
  } catch (err) {
    console.error('[botTriggers] failed to schedule bot reaction:', err)
  }
}
