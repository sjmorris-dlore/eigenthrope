import { CHARACTERS, inIdleWindow } from './characters.js'
import { getCharacterState, claimPendingPost, allPendingPosts, schedulePendingPost, type CharacterState } from './state.js'
import { executePost } from './poster.js'
import { claimPendingArtifacts } from './artifacts.js'
import { getTestMode } from './story.js'
import {
  CLAIM_INTERVAL_MS_PROD, CLAIM_INTERVAL_MS_TEST, POLL_INTERVAL_MS,
  IDLE_CHANCE_PER_TICK_PROD, IDLE_CHANCE_PER_TICK_TEST,
  IDLE_MIN_GAP_MS_PROD, IDLE_MIN_GAP_MS_TEST,
  IDLE_TANGENT_CHANCE, IDLE_THEORY_CHANCE, THEORIES_CHANNEL_ID,
} from './config.js'

let lastClaimCheck = 0

/** Periodically claim NFT offers the game has extended to the bot wallets. */
async function maybeClaimArtifacts(): Promise<void> {
  const interval = (await getTestMode()) ? CLAIM_INTERVAL_MS_TEST : CLAIM_INTERVAL_MS_PROD
  if (Date.now() - lastClaimCheck < interval) return
  lastClaimCheck = Date.now()
  try {
    await claimPendingArtifacts()
  } catch (err) {
    console.error('[scheduler] artifact claim pass failed:', err)
  }
}

/**
 * Unprompted posts: each tick inside a character's posting window rolls a
 * small chance of scheduling an idle musing (memoryless, so restarts don't
 * need persisted roll state). Most land in #current-story; some are
 * bigger-picture takes routed to #theories; a few are story-adjacent
 * personal tangents. Test mode ignores windows and rolls much hotter.
 */
async function maybeScheduleIdlePost(
  character: (typeof CHARACTERS)[number],
  state: CharacterState,
  testMode: boolean,
): Promise<void> {
  if (state.pending_posts?.idle || state.pending_posts?.theory) return
  if (!testMode && !inIdleWindow(character)) return

  const chance = testMode ? IDLE_CHANCE_PER_TICK_TEST : IDLE_CHANCE_PER_TICK_PROD
  if (Math.random() >= chance) return

  const minGap = testMode ? IDLE_MIN_GAP_MS_TEST : IDLE_MIN_GAP_MS_PROD
  if (state.last_posted_at && Date.now() - new Date(state.last_posted_at).getTime() < minGap) return

  const asTheory = THEORIES_CHANNEL_ID() !== '' && Math.random() < IDLE_THEORY_CHANCE
  const asTangent = !asTheory && Math.random() < IDLE_TANGENT_CHANCE

  await schedulePendingPost(character.name, {
    scheduled_for: new Date(Date.now() + 60_000).toISOString(),
    trigger: asTheory ? 'theory' : 'idle',
    channel: asTheory ? 'theories' : 'story',
    context: asTangent
      ? 'Make this one a personal, story-adjacent tangent — something from your day or your head that orbits the story, not analysis of the mystery itself.'
      : undefined,
  })
  console.log(`[scheduler] ${character.name}: rolled an unprompted ${asTheory ? 'theory' : asTangent ? 'tangent' : 'musing'} post`)
}

/**
 * Durable scheduler: pending posts live in DynamoDB (written by the Next.js
 * admin routes and by the observer response chain), so schedules survive
 * process restarts. Each tick claims due posts atomically before executing.
 */
async function tick(): Promise<void> {
  await maybeClaimArtifacts()
  const testMode = await getTestMode()

  for (const character of CHARACTERS) {
    const { name } = character
    try {
      const state = await getCharacterState(name)

      await maybeScheduleIdlePost(character, state, testMode)

      // Due posts execute oldest-first so e.g. the vote_close commentary
      // lands before the next episode_open reaction.
      const pendings = allPendingPosts(state)
        .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))

      for (const pending of pendings) {
        const dueInMs = new Date(pending.scheduled_for).getTime() - Date.now()
        if (dueInMs > 0) {
          console.log(`[scheduler] ${name}: ${pending.trigger} post due in ${Math.ceil(dueInMs / 1000)}s`)
          continue
        }

        const isLegacy = state.pending_post?.scheduled_for === pending.scheduled_for &&
          state.pending_post?.trigger === pending.trigger
        const claimed = await claimPendingPost(name, pending, isLegacy)
        if (!claimed) continue // another worker or a fresher schedule won

        await executePost(name, {
          trigger: pending.trigger === 'vesper_posted' ? 'peer_posted' : pending.trigger,
          triggerContext: pending.context,
          gameWhich: pending.game_which,
          channel: pending.channel,
        })
      }
    } catch (err) {
      console.error(`[scheduler] ${name} tick failed:`, err)
    }
  }
}

export function startScheduler(): void {
  console.log(`[scheduler] polling every ${POLL_INTERVAL_MS / 1000}s`)
  void tick()
  setInterval(() => void tick(), POLL_INTERVAL_MS)
}
