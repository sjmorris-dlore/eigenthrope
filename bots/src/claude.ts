import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { CLAUDE_MODEL } from './config.js'
import type { CharacterDef } from './characters.js'
import type { GameContext } from './story.js'
import type { CharacterState, PostRecord, TriggerKind } from './state.js'

const client = new Anthropic() // ANTHROPIC_API_KEY from env

export interface DiscordMessageContext {
  author: string
  content: string
}

export interface GenerateInput {
  character: CharacterDef
  trigger: TriggerKind
  /** Extra trigger context, e.g. the vesper_null post being responded to, or the mention text */
  triggerContext?: string
  game: GameContext | null
  state: CharacterState
  recentChannelMessages: DiscordMessageContext[]
  /** Whether a vote decision is wanted from this call */
  wantVote: boolean
}

export interface GenerateOutput {
  post: string
  voteChoice: string | null
  workingTheory: string
}

const TRIGGER_DESCRIPTIONS: Record<TriggerKind, string> = {
  episode_open: 'A new episode has just opened for voting. React to the new chapter and decide which choice you resonate with.',
  vote_close: 'Voting has just closed and the outcome is known. React to how the community chose and what it means for the story.',
  peer_posted: 'Another observer just posted in the channel (their post is included below). Respond to their take — build on it or push back.',
  vesper_posted: 'vesper_null just posted in the channel (her post is included below). Respond to her take — build on it or push back.',
  mention: 'Someone in the Discord channel mentioned you directly (their message is included below). Reply to them in character.',
  game_reset: 'Voting has just been reset and the current chapter is open again — this can happen during testing, or if the story itself restarted. Treat it like the chapter just opened: react to it and vote for the choice you resonate with.',
  idle: 'Nothing new has happened in the game — this post is unprompted. You have been re-reading, or something has been nagging at you about the story. Post the musing. Do not announce that nothing happened; just say the thing.',
  theory: 'Step back from the latest events and post your bigger-picture read of the mystery to the theories channel — where observers lay out long arcs, not hot takes. For this post only, up to 5 sentences is fine.',
}

function buildPrompt(input: GenerateInput): string {
  const { character, trigger, triggerContext, game, state, recentChannelMessages, wantVote } = input
  const sections: string[] = []

  sections.push(`# Trigger\n${TRIGGER_DESCRIPTIONS[trigger]}`)
  if (triggerContext) sections.push(`# Trigger context\n${triggerContext}`)

  if (game) {
    const lines = [
      `Universe: ${game.universe} · Chapter: ${game.record.chapter_label ?? game.chapter} · Choice point: ${game.cp}`,
      `Status: ${game.record.status}`,
    ]
    if (game.record.prompt) lines.push(`Decision prompt: ${game.record.prompt}`)
    if (game.record.choices) {
      const choiceLines = Object.entries(game.record.choices)
        .map(([id, c]) => `  ${id}. ${c.label} — ${c.description}`)
        .join('\n')
      lines.push(`Choices:\n${choiceLines}`)
    }
    if (game.winningLabel) lines.push(`Winning choice: ${game.record.winning_choice} — ${game.winningLabel}`)
    sections.push(`# Current episode\n${lines.join('\n')}`)

    if (game.storyText) sections.push(`# Episode text (what all players can read)\n${game.storyText}`)
    if (game.outcomeText) sections.push(`# Outcome text\n${game.outcomeText}`)
  }

  if (state.working_theory) {
    sections.push(`# Your current working theory about the mystery\n${state.working_theory}`)
  }
  if (state.history_summary) {
    sections.push(`# Summary of your older posts\n${state.history_summary}`)
  }
  const recentPosts = state.post_history.slice(-10)
  if (recentPosts.length > 0) {
    sections.push(`# Your last ${recentPosts.length} posts\n` +
      recentPosts.map(p => `[${p.at}] ${p.text}`).join('\n'))
  }
  if (recentChannelMessages.length > 0) {
    sections.push(`# Recent Discord channel messages (oldest first)\n` +
      recentChannelMessages.map(m => `${m.author}: ${m.content}`).join('\n'))
  }

  sections.push(`# Your task
Write your next Discord post, in character. 1–3 sentences maximum.
${wantVote ? 'Also pick the choice you will vote for on-chain.' : 'No vote is needed for this post.'}
Update your working theory about the mystery: 2–5 sentences, plain text, written in character. It is displayed publicly on the game site.`)

  return sections.join('\n\n')
}

export async function generatePost(input: GenerateInput): Promise<GenerateOutput> {
  const choiceIds = input.wantVote && input.game?.record.choices
    ? Object.keys(input.game.record.choices)
    : []

  const schema = z.object({
    post: z.string().describe('The Discord post, 1-3 sentences, in character'),
    vote_choice: (choiceIds.length > 0
      ? z.enum(choiceIds as [string, ...string[]]).nullable()
      : z.null()
    ).describe('The choice ID to vote for, or null if no vote applies'),
    working_theory: z.string().describe('Updated working theory, 2-5 sentences, in character'),
  })

  const response = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    system: input.character.brief,
    messages: [{ role: 'user', content: buildPrompt(input) }],
    output_config: { format: zodOutputFormat(schema) },
  })

  const parsed = response.parsed_output
  if (!parsed) throw new Error(`[claude] failed to parse structured output (stop_reason=${response.stop_reason})`)

  return {
    post: parsed.post.trim(),
    voteChoice: parsed.vote_choice ?? null,
    workingTheory: parsed.working_theory.trim(),
  }
}

/** Condense a batch of old posts into (or onto) the rolling history summary. */
export async function summarisePosts(
  character: CharacterDef,
  existingSummary: string | undefined,
  posts: PostRecord[],
): Promise<string> {
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: character.brief,
    messages: [{
      role: 'user',
      content: `Condense the following into a single paragraph capturing the arc of your past commentary — key claims, predictions, and reversals. Write in third person about yourself ("${character.name} argued...").

${existingSummary ? `Existing summary of even older posts (fold this in):\n${existingSummary}\n\n` : ''}Posts to summarise:\n${posts.map(p => `[${p.at}] ${p.text}`).join('\n')}`,
    }],
  })
  const block = response.content.find(b => b.type === 'text')
  return block?.type === 'text' ? block.text.trim() : (existingSummary ?? '')
}
