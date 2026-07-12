/**
 * Clear all messages from a Discord channel using vesper_null's bot token.
 *
 * The bot needs the "Manage Messages" permission in the target channel
 * (channel settings → Permissions). Messages younger than 14 days are
 * bulk-deleted (fast); older ones are deleted one-by-one (slow, rate-limited).
 *
 * Usage (from the bots/ directory):
 *   node --env-file=.env scripts/clear-channel.mjs <channel_id> --yes
 */

import { Client, GatewayIntentBits } from 'discord.js'

const channelId = process.argv[2]
const confirmed = process.argv.includes('--yes')

if (!channelId || !confirmed) {
  console.error('Usage: node --env-file=.env scripts/clear-channel.mjs <channel_id> --yes')
  console.error('(--yes required: this deletes EVERY message in the channel)')
  process.exit(1)
}

const token = process.env.VESPER_NULL_DISCORD_TOKEN?.trim()
if (!token) {
  console.error('VESPER_NULL_DISCORD_TOKEN not set — run with --env-file=.env from bots/')
  process.exit(1)
}

const TWO_WEEKS_MS = 14 * 24 * 3600_000
const client = new Client({ intents: [GatewayIntentBits.Guilds] })

client.once('clientReady', async () => {
  try {
    const channel = await client.channels.fetch(channelId)
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      throw new Error(`Channel ${channelId} is not a guild text channel`)
    }
    console.log(`Clearing #${channel.name} (${channelId})...`)

    let total = 0
    for (;;) {
      const batch = await channel.messages.fetch({ limit: 100 })
      if (batch.size === 0) break

      const young = batch.filter(m => Date.now() - m.createdTimestamp < TWO_WEEKS_MS && !m.pinned)
      const old = batch.filter(m => Date.now() - m.createdTimestamp >= TWO_WEEKS_MS && !m.pinned)

      if (young.size > 0) {
        // bulkDelete(_, true) silently skips anything the API rejects
        const deleted = await channel.bulkDelete(young, true)
        total += deleted.size
        console.log(`  bulk-deleted ${deleted.size} (total ${total})`)
      }
      for (const [, msg] of old) {
        await msg.delete()
        total++
        if (total % 10 === 0) console.log(`  deleted ${total}...`)
        await new Promise(r => setTimeout(r, 1200)) // stay under rate limits
      }

      const remaining = batch.filter(m => !m.pinned)
      if (remaining.size === 0) break
    }

    console.log(`Done — ${total} message(s) deleted (pinned messages skipped).`)
  } catch (err) {
    console.error('Failed:', err)
    process.exitCode = 1
  } finally {
    await client.destroy()
  }
})

client.login(token)
