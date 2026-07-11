import type { Message } from 'discord.js'
import { CHARACTERS_BY_NAME, type CharacterName } from './characters.js'
import { generatePost, summarisePosts } from './claude.js'
import { getRecentMessages, sendPost } from './discordBots.js'
import { loadGameContext } from './story.js'
import {
  getCharacterState, saveCharacterState, schedulePendingPost,
  postsToSummarise, HISTORY_SUMMARISE_BATCH,
  type TriggerKind,
} from './state.js'
import { submitVote } from './xrplVote.js'
import { AMBER_DRIFT_DELAY_MS_PROD, AMBER_DRIFT_DELAY_MS_TEST, randomDelay } from './config.js'
import { getTestMode } from './story.js'

export interface ExecuteOptions {
  trigger: TriggerKind
  triggerContext?: string
  gameWhich?: 'active' | 'previous'
  /** For mention replies: the message to reply to */
  replyTo?: Message
}

/**
 * The full post pipeline: gather context → one Claude call → Discord post →
 * XRPL vote (if the chapter is open and this character hasn't voted) →
 * persist state → chain amber_drift's response if vesper_null posted.
 */
export async function executePost(name: CharacterName, opts: ExecuteOptions): Promise<void> {
  const character = CHARACTERS_BY_NAME[name]
  const gameWhich = opts.gameWhich ?? (opts.trigger === 'vote_close' ? 'previous' : 'active')

  const [game, state, recentChannelMessages] = await Promise.all([
    loadGameContext(gameWhich),
    getCharacterState(name),
    getRecentMessages(name, 20),
  ])

  const voteTag = game ? `${game.choicePoint}:rv${game.resetVersion}` : null
  const wantVote =
    game !== null &&
    game.record.status === 'open' &&
    opts.trigger !== 'mention' && // mentions are conversation, not vote events
    state.last_voted !== voteTag

  const voteReason = !game ? 'no game context'
    : game.record.status !== 'open' ? 'chapter closed'
    : opts.trigger === 'mention' ? 'mention reply'
    : state.last_voted === voteTag ? `already voted (${voteTag})`
    : 'eligible'
  console.log(
    `[poster] ${name} executing ${opts.trigger}: game=${game?.choicePoint ?? '(none)'} ` +
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

  await sendPost(name, result.post, opts.replyTo)
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

  // Chain: vesper_null's scheduled posts trigger an amber_drift response
  if (name === 'vesper_null' && opts.trigger !== 'mention') {
    const testMode = await getTestMode()
    const delay = randomDelay(testMode ? AMBER_DRIFT_DELAY_MS_TEST : AMBER_DRIFT_DELAY_MS_PROD)
    await schedulePendingPost('amber_drift', {
      scheduled_for: new Date(Date.now() + delay).toISOString(),
      trigger: 'vesper_posted',
      context: result.post,
      game_which: gameWhich,
    })
    const delayLabel = delay < 60_000 ? `${Math.round(delay / 1000)}s` : `${Math.round(delay / 60_000)}min`
    console.log(`[poster] scheduled amber_drift response in ${delayLabel}${testMode ? ' (test mode)' : ''}`)
  }
}
