function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

export const AWS_REGION = process.env.AWS_REGION?.trim() || 'us-east-1'

// XRPL
export const XRPL_WSS = process.env.XRPL_WSS?.trim() || 'wss://xrplcluster.com/'
export const SOURCE_TAG = 2606230005 // hackathon source tag — required on every mainnet tx
export const vaultAddress = () => required('EIGENTHROPE_VAULT_ADDRESS')

// S3
export const STORIES_BUCKET = process.env.EIGENTHROPE_S3_BUCKET?.trim() ?? ''

// Main site — used for the public resonance API (single source of truth for vote weight)
export const SITE_URL = process.env.EIGENTHROPE_SITE_URL?.trim() || 'https://eigenthrope.sjmorriswrites.com'

// Discord channels: #current-story is where the bots live (reactions, banter,
// mentions); #theories gets occasional bigger-picture theory posts.
// EIGENTHROPE_CHANNEL_ID is the legacy single-channel var, kept as fallback.
export type ChannelKind = 'story' | 'theories'

export function STORY_CHANNEL_ID(): string {
  const v = process.env.EIGENTHROPE_STORY_CHANNEL_ID?.trim() || process.env.EIGENTHROPE_CHANNEL_ID?.trim()
  if (!v) throw new Error('Missing env var: EIGENTHROPE_STORY_CHANNEL_ID (or legacy EIGENTHROPE_CHANNEL_ID)')
  return v
}

/** Empty string when not configured — theory posts then fall back to the story channel. */
export function THEORIES_CHANNEL_ID(): string {
  return process.env.EIGENTHROPE_THEORIES_CHANNEL_ID?.trim() ?? ''
}

export function channelId(kind: ChannelKind): string {
  if (kind === 'theories') return THEORIES_CHANNEL_ID() || STORY_CHANNEL_ID()
  return STORY_CHANNEL_ID()
}

// Claude
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL?.trim() || 'claude-sonnet-4-6'

// Tables
export const CONFIG_TABLE = 'eigenthrope_config'
export const CHAPTERS_TABLE = 'eigenthrope_chapters'

// Scheduling (ms)
export const POLL_INTERVAL_MS = 60_000
export const CLAIM_INTERVAL_MS_PROD = 30 * 60_000 // check for claimable NFT offers every 30min
export const CLAIM_INTERVAL_MS_TEST = 2 * 60_000  // every 2min in test mode

// Peer response: after a bot reacts to a game event, each OTHER bot may respond
export const PEER_DELAY_MS_PROD: [number, number] = [30 * 60_000, 90 * 60_000] // 30–90min
export const PEER_DELAY_MS_TEST: [number, number] = [30_000, 90_000] // 30–90s in test mode
export const PEER_SILENCE_CHANCE = 0.2 // sometimes an observer just doesn't respond

// Theory posts (#theories): a step-back take after a chapter concludes
export const THEORY_AFTER_CLOSE_CHANCE = 0.6
export const THEORY_DELAY_MS_PROD: [number, number] = [2 * 3600_000, 6 * 3600_000] // 2–6h
export const THEORY_DELAY_MS_TEST: [number, number] = [2 * 60_000, 4 * 60_000] // 2–4min

// Idle posts: unprompted musings when nothing has happened in the game.
// Rolled once per scheduler tick (60s) while inside the character's posting
// window — 1/500 per tick over a ~7h window ≈ 0.8 posts/day.
export const IDLE_CHANCE_PER_TICK_PROD = 1 / 500
export const IDLE_CHANCE_PER_TICK_TEST = 1 / 10
export const IDLE_MIN_GAP_MS_PROD = 4 * 3600_000 // no idle post within 4h of any other post
// 30min gap caps idle chatter at ~2/hr/bot (~$2/day) even when test mode is
// forgotten ON — event/chain/claim timings stay fast regardless.
export const IDLE_MIN_GAP_MS_TEST = 30 * 60_000
export const IDLE_TANGENT_CHANCE = 0.25 // story-adjacent personal tangent instead of analysis
export const IDLE_THEORY_CHANCE = 0.2 // idle post goes to #theories as a bigger-picture take

// Emoji reactions to player messages: presence without noise
export const REACTION_CHANCE = 0.05
export const REACTION_COOLDOWN_MS = 15 * 60_000

export const MENTION_COOLDOWN_MS = 2 * 60_000 // per-bot cooldown for @mention replies

export function randomDelay([min, max]: [number, number]): number {
  return min + Math.floor(Math.random() * (max - min))
}
