import type { Message } from 'discord.js'
import { CHARACTERS, CHARACTERS_BY_NAME, type CharacterName } from './characters.js'
import { generatePost, summarisePosts } from './claude.js'
import { getRecentMessages, sendPost } from './discordBots.js'
import { getTestMode, loadGameContext } from './story.js'
import {
  getCharacterState, saveCharacterState, schedulePendingPost,
  postsToSummarise, HISTORY_SUMMARISE_BATCH,
  type TriggerKind,
} from './state.js'
import { submitVote } from './xrplVote.js'
import {
  PEER_DELAY_MS_PROD, PEER_DELAY_MS_TEST, PEER_SILENCE_CHANCE,
  THEORY_AFTER_CLOSE_CHANCE, THEORY_DELAY_MS_PROD, THEORY_DELAY_MS_TEST,
  THEORIES_CHANNEL_ID, randomDelay, type ChannelKind,
} from './config.js'

export interface ExecuteOptions {
  trigger: TriggerKind
  triggerContext?: string
  gameWhich?: 'active' | 'previous'
  channel?: ChannelKind
  /** For mention replies: the message to reply to */
  replyTo?: Message
}

/** Game-event triggers that start a response chain among the other observers */
const CHAIN_TRIGGERS: ReadonlySet<TriggerKind> = new Set(['episode_open', 'vote_close', 'game_reset'])
/** Triggers that never vote — conversation and musings, not game actions */
const NO_VOTE_TRIGGERS: ReadonlySet<TriggerKind> = new Set(['mention', 'idle', 'theory'])

/**
 * The full post pipeline: gather context → one Claude call → Discord post →
 * XRPL vote (if the chapter is open and this character hasn't voted) →
 * persist state → chain the other observers' responses on game events.
 */
export async function executePost(name: CharacterName, opts: ExecuteOptions): Promise<void> {
  const character = CHARACTERS_BY_NAME[name]
  const gameWhich = opts.gameWhich ?? (opts.trigger === 'vote_close' ? 'previous' : 'active')
  const channel: ChannelKind = opts.channel ?? 'story'

  const [game, state, recentChannelMessages] = await Promise.all([
    loadGameContext(gameWhich),
    getCharacterState(name),
    getRecentMessages(name, channel, 20),
  ])

  const voteTag = game ? `${game.choicePoint}:rv${game.resetVersion}` : null
  const wantVote =
    game !== null &&
    game.record.status === 'open' &&
    !NO_VOTE_TRIGGERS.has(opts.trigger) &&
    state.last_voted !== voteTag

  const voteReason = !game ? 'no game context'
    : game.record.status !== 'open' ? 'chapter closed'
    : NO_VOTE_TRIGGERS.has(opts.trigger) ? `${opts.trigger} posts do not vote`
    : state.last_voted === voteTag ? `already voted (${voteTag})`
    : 'eligible'
  console.log(
    `[poster] ${name} executing ${opts.trigger} → #${channel}: game=${game?.choicePoint ?? '(none)'} ` +
    `status=${game?.record.status ?? '-'} rv=${game?.resetVersion ?? '-'} vote=${wantVote ? 'yes' : `no (${voteReason})`}`
  )

  const claudeStart = Date.now()
  const result = await generatePost({
    character,
    trigger: opts.trigger,
    triggerContext: opts.triggerContext,
    game,
    state,
    recentChannelMessages,
    wantVote,
  })

  console.log(`[poster] ${name} claude call done in ${((Date.now() - claudeStart) / 1000).toFixed(1)}s (choice=${result.voteChoice ?? 'none'})`)

  await sendPost(name, result.post, channel, opts.replyTo)
  console.log(`[poster] ${name} posted (${opts.trigger}): ${result.post}`)

  const now = new Date().toISOString()

  if (wantVote && result.voteChoice && game && voteTag) {
    try {
      const vote = await submitVote(character, game, result.voteChoice)
      state.last_voted = voteTag
      console.log(`[poster] ${name} voted ${result.voteChoice} on ${game.choicePoint} (tx ${vote.hash})`)
    } catch (err) {
      console.error(`[poster] ${name} vote failed (post already sent):`, err)
    }
  } else if (wantVote && !result.voteChoice) {
    console.warn(`[poster] ${name} was vote-eligible but chose not to vote`)
  }

  // Persist state: theory, history (with rolling summarisation), timestamps
  state.working_theory = result.workingTheory
  state.post_history.push({ text: result.post, at: now, trigger: opts.trigger })
  state.last_posted_at = now

  const oldPosts = postsToSummarise(state)
  if (oldPosts.length > 0) {
    try {
      state.history_summary = await summarisePosts(character, state.history_summary, oldPosts)
      state.post_history = state.post_history.slice(HISTORY_SUMMARISE_BATCH)
    } catch (err) {
      console.error(`[poster] ${name} history summarisation failed (keeping full history):`, err)
    }
  }

  await saveCharacterState(state)

  // Chain: a game-event post invites responses from the other observers —
  // each independently, and sometimes one simply stays silent.
  if (CHAIN_TRIGGERS.has(opts.trigger)) {
    const testMode = await getTestMode()
    for (const peer of CHARACTERS) {
      if (peer.name === name) continue
      if (Math.random() < PEER_SILENCE_CHANCE) {
        console.log(`[poster] ${peer.name} stays silent this time`)
        continue
      }
      const delay = randomDelay(testMode ? PEER_DELAY_MS_TEST : PEER_DELAY_MS_PROD)
      await schedulePendingPost(peer.name, {
        scheduled_for: new Date(Date.now() + delay).toISOString(),
        trigger: 'peer_posted',
        context: `${name}: ${result.post}`,
        game_which: gameWhich,
        channel,
      })
      const delayLabel = delay < 60_000 ? `${Math.round(delay / 1000)}s` : `${Math.round(delay / 60_000)}min`
      console.log(`[poster] scheduled ${peer.name} response in ${delayLabel}${testMode ? ' (test mode)' : ''}`)
    }

    // After a chapter concludes, the initiator sometimes steps back and posts
    // a bigger-picture take to #theories.
    if (opts.trigger === 'vote_close' && THEORIES_CHANNEL_ID() && Math.random() < THEORY_AFTER_CLOSE_CHANCE) {
      const delay = randomDelay(testMode ? THEORY_DELAY_MS_TEST : THEORY_DELAY_MS_PROD)
      await schedulePendingPost(name, {
        scheduled_for: new Date(Date.now() + delay).toISOString(),
        trigger: 'theory',
        game_which: 'previous',
        channel: 'theories',
      })
      console.log(`[poster] scheduled ${name} theory post in ${Math.round(delay / 60_000)}min${testMode ? ' (test mode)' : ''}`)
    }
  }
}
