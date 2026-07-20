import { CHARACTERS, inIdleWindow } from './characters.js'
import { getCharacterState, claimPendingPost, allPendingPosts, schedulePendingPost, type CharacterState } from './state.js'
import { executePost } from './poster.js'
import { claimPendingArtifacts } from './artifacts.js'
import { getTestMode, getBotClaimSignal, getBotPace, loadGameContext } from './story.js'
import {
  CLAIM_INTERVAL_MS_PROD, CLAIM_INTERVAL_MS_TEST, POLL_INTERVAL_MS,
  IDLE_CHANCE_PER_TICK_PROD, IDLE_CHANCE_PER_TICK_TEST,
  IDLE_MIN_GAP_MS_PROD, IDLE_MIN_GAP_MS_TEST,
  IDLE_TANGENT_CHANCE, IDLE_THEORY_CHANCE, THEORIES_CHANNEL_ID,
  VOTE_GUARANTEE_GRACE_MS_PROD, VOTE_GUARANTEE_GRACE_MS_TEST,
} from './config.js'

let lastClaimCheck = 0
let lastSeenClaimSignal: string | null = null

/**
 * Claim NFT offers the game has extended to the bot wallets. Primarily
 * signal-driven: the create-offers Lambda writes bot_claim_signal the
 * moment new offers exist, and that's checked (cheaply — one small config
 * read) every tick, so claims land within ~60s of minting instead of
 * waiting on a timer. CLAIM_INTERVAL_MS is now just a safety-net sweep in
 * case a signal write is ever missed.
 */
async function maybeClaimArtifacts(): Promise<void> {
  const [testMode, signal] = await Promise.all([getTestMode(), getBotClaimSignal()])
  const signalIsNew = signal !== null && signal !== lastSeenClaimSignal
  if (signal !== null) lastSeenClaimSignal = signal

  const interval = testMode ? CLAIM_INTERVAL_MS_TEST : CLAIM_INTERVAL_MS_PROD
  if (!signalIsNew && Date.now() - lastClaimCheck < interval) return
  lastClaimCheck = Date.now()

  try {
    await claimPendingArtifacts()
    if (signalIsNew) console.log(`[scheduler] artifact claim triggered by mint signal (${signal})`)
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
  pace: number,
): Promise<void> {
  if (state.pending_posts?.idle || state.pending_posts?.theory) return
  if (!testMode && !inIdleWindow(character)) return

  // Admin pace lever: pace 2 = half the idle frequency, double the gap
  const chance = (testMode ? IDLE_CHANCE_PER_TICK_TEST : IDLE_CHANCE_PER_TICK_PROD) / pace
  if (Math.random() >= chance) return

  const minGap = (testMode ? IDLE_MIN_GAP_MS_TEST : IDLE_MIN_GAP_MS_PROD) * pace
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
 * Vote-coverage safety net. The normal path to a vote is the initiator pick
 * (site-side, on episode open/reset) plus the peer chain (bots-side, on that
 * initiator's post) — and poster.ts now guarantees a peer's slot in that
 * chain when they haven't voted yet. But that chain can still fail to reach
 * someone entirely: two chain events landing on the same bot as initiator
 * back-to-back, a process restart at the wrong moment, anything. This is the
 * backstop — if a bot has nothing at all scheduled and hasn't voted on the
 * active choice point well past any plausible natural delay, force it.
 */
async function maybeGuaranteeVote(
  character: (typeof CHARACTERS)[number],
  state: CharacterState,
  activeVoteTag: string | null,
  votingOpenedAt: string | undefined,
  testMode: boolean,
  pace: number,
): Promise<void> {
  if (!activeVoteTag || state.last_voted === activeVoteTag) return
  if (Object.keys(state.pending_posts ?? {}).length > 0) return // something's already coming

  const grace = (testMode ? VOTE_GUARANTEE_GRACE_MS_TEST : VOTE_GUARANTEE_GRACE_MS_PROD) * pace
  if (votingOpenedAt && Date.now() - new Date(votingOpenedAt).getTime() < grace) return

  await schedulePendingPost(character.name, {
    scheduled_for: new Date(Date.now() + 60_000).toISOString(),
    trigger: 'episode_open',
    game_which: 'active',
    channel: 'story',
  })
  console.log(`[scheduler] ${character.name}: guaranteed a vote reaction on ${activeVoteTag} — safety net, nothing was scheduled`)
}

/**
 * Durable scheduler: pending posts live in DynamoDB (written by the Next.js
 * admin routes and by the observer response chain), so schedules survive
 * process restarts. Each tick claims due posts atomically before executing.
 */
async function tick(): Promise<void> {
  await maybeClaimArtifacts()
  const [testMode, pace, activeGame] = await Promise.all([getTestMode(), getBotPace(), loadGameContext('active')])
  const activeVoteTag = activeGame && activeGame.record.status === 'open'
    ? `${activeGame.choicePoint}:rv${activeGame.resetVersion}`
    : null

  for (const character of CHARACTERS) {
    const { name } = character
    try {
      const state = await getCharacterState(name)

      await maybeScheduleIdlePost(character, state, testMode, pace)
      await maybeGuaranteeVote(character, state, activeVoteTag, activeGame?.record.voting_opens_at, testMode, pace)

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
