import { CHARACTERS } from './characters.js'
import { getCharacterState, claimPendingPost, allPendingPosts } from './state.js'
import { executePost } from './poster.js'
import { claimPendingArtifacts } from './artifacts.js'
import { getTestMode } from './story.js'
import { CLAIM_INTERVAL_MS_PROD, CLAIM_INTERVAL_MS_TEST, POLL_INTERVAL_MS } from './config.js'

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
 * Durable scheduler: pending posts live in DynamoDB (written by the Next.js
 * admin routes and by the vesper→amber_drift chain), so schedules survive
 * process restarts. Each tick claims due posts atomically before executing.
 */
async function tick(): Promise<void> {
  await maybeClaimArtifacts()
  for (const { name } of CHARACTERS) {
    try {
      const state = await getCharacterState(name)
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
          trigger: pending.trigger,
          triggerContext: pending.context,
          gameWhich: pending.game_which,
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
