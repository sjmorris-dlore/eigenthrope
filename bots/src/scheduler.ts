import { CHARACTERS } from './characters.js'
import { getCharacterState, claimPendingPost } from './state.js'
import { executePost } from './poster.js'
import { POLL_INTERVAL_MS } from './config.js'

/**
 * Durable scheduler: pending posts live in DynamoDB (written by the Next.js
 * admin routes and by the vesper→amber_drift chain), so schedules survive
 * process restarts. Each tick claims due posts atomically before executing.
 */
async function tick(): Promise<void> {
  for (const { name } of CHARACTERS) {
    try {
      const state = await getCharacterState(name)
      const pending = state.pending_post
      if (!pending) continue
      const dueInMs = new Date(pending.scheduled_for).getTime() - Date.now()
      if (dueInMs > 0) {
        console.log(`[scheduler] ${name}: ${pending.trigger} post due in ${Math.ceil(dueInMs / 1000)}s`)
        continue
      }

      const claimed = await claimPendingPost(name, pending.scheduled_for)
      if (!claimed) continue // another worker or a fresher schedule won

      await executePost(name, {
        trigger: pending.trigger,
        triggerContext: pending.context,
        gameWhich: pending.game_which,
      })
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
