/**
 * Bulk-deletes all messages from the Eigenthrope Discord channels — for
 * clearing test chatter between resets. Uses the Discord REST API directly
 * (no discord.js dependency needed for this one-off admin task).
 *
 * One-time setup — add to .env.local:
 *   DISCORD_BOT_TOKEN=<either bot's token, from the Discord Developer Portal
 *                       -> Applications -> vesper_null or amber_drift ->
 *                       Bot tab -> Reset Token / Copy>
 *   EIGENTHROPE_STORY_CHANNEL_ID=<#current-story channel ID>
 *   EIGENTHROPE_THEORIES_CHANNEL_ID=<#theories channel ID>
 *     (right-click the channel in Discord -> Copy Channel ID — requires
 *      User Settings -> Advanced -> Developer Mode ON)
 *
 * The bot needs the "Manage Messages" permission in the server.
 *
 * Usage: node scripts/clear-discord-channels.mjs --yes
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

const API = 'https://discord.com/api/v10'
const TOKEN = process.env.DISCORD_BOT_TOKEN
const STORY_CHANNEL_ID = process.env.EIGENTHROPE_STORY_CHANNEL_ID?.trim() || process.env.EIGENTHROPE_CHANNEL_ID?.trim()
const THEORIES_CHANNEL_ID = process.env.EIGENTHROPE_THEORIES_CHANNEL_ID?.trim()

if (!process.argv.includes('--yes')) {
  console.error('This deletes ALL messages in the story and theories channels. Re-run with --yes to proceed.')
  process.exit(1)
}
if (!TOKEN) {
  console.error('Missing DISCORD_BOT_TOKEN in .env.local — see the comment at the top of this script.')
  process.exit(1)
}
if (!STORY_CHANNEL_ID) {
  console.error('Missing EIGENTHROPE_STORY_CHANNEL_ID in .env.local.')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function discordFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}))
    const retryAfterMs = Math.ceil((body.retry_after ?? 1) * 1000) + 100
    console.log(`  rate limited — waiting ${retryAfterMs}ms`)
    await sleep(retryAfterMs)
    return discordFetch(path, options)
  }
  if (!res.ok && res.status !== 204) {
    const body = await res.text()
    throw new Error(`Discord API ${res.status} on ${path}: ${body}`)
  }
  return res.status === 204 ? null : res.json()
}

async function clearChannel(channelId, label) {
  console.log(`\nClearing #${label} (${channelId})...`)
  let totalDeleted = 0
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000

  while (true) {
    const messages = await discordFetch(`/channels/${channelId}/messages?limit=100`)
    if (!messages || messages.length === 0) break

    const cutoff = Date.now() - fourteenDaysMs
    const bulkable = messages.filter((m) => new Date(m.timestamp).getTime() > cutoff)
    const tooOld = messages.filter((m) => new Date(m.timestamp).getTime() <= cutoff)

    if (bulkable.length >= 2) {
      await discordFetch(`/channels/${channelId}/messages/bulk-delete`, {
        method: 'POST',
        body: JSON.stringify({ messages: bulkable.map((m) => m.id) }),
      })
      totalDeleted += bulkable.length
      console.log(`  bulk-deleted ${bulkable.length} (running total: ${totalDeleted})`)
    } else if (bulkable.length === 1) {
      await discordFetch(`/channels/${channelId}/messages/${bulkable[0].id}`, { method: 'DELETE' })
      totalDeleted += 1
      console.log(`  deleted 1 (running total: ${totalDeleted})`)
    }

    if (tooOld.length > 0) {
      console.log(`  ${tooOld.length} message(s) older than 14 days — Discord requires deleting these one at a time...`)
      for (const m of tooOld) {
        await discordFetch(`/channels/${channelId}/messages/${m.id}`, { method: 'DELETE' })
        totalDeleted += 1
        await sleep(600) // stay comfortably under the per-channel delete rate limit
      }
    }

    if (messages.length < 100) break // that was the last page
  }

  console.log(`  done — ${totalDeleted} message(s) removed from #${label}`)
}

await clearChannel(STORY_CHANNEL_ID, 'current-story')
if (THEORIES_CHANNEL_ID && THEORIES_CHANNEL_ID !== STORY_CHANNEL_ID) {
  await clearChannel(THEORIES_CHANNEL_ID, 'theories')
}

console.log('\nAll channels cleared.')
