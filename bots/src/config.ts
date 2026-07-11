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

// Discord
export const CHANNEL_ID = () => required('EIGENTHROPE_CHANNEL_ID')

// Claude
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL?.trim() || 'claude-sonnet-4-6'

// Tables
export const CONFIG_TABLE = 'eigenthrope_config'
export const CHAPTERS_TABLE = 'eigenthrope_chapters'

// Scheduling (ms)
export const POLL_INTERVAL_MS = 60_000
export const AMBER_DRIFT_DELAY_MS_PROD: [number, number] = [30 * 60_000, 60 * 60_000] // 30–60min
export const AMBER_DRIFT_DELAY_MS_TEST: [number, number] = [30_000, 90_000] // 30–90s, for the admin test-mode toggle
export const MENTION_COOLDOWN_MS = 2 * 60_000 // per-channel cooldown for @mention replies

export function randomDelay([min, max]: [number, number]): number {
  return min + Math.floor(Math.random() * (max - min))
}
