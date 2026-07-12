import { Client, GatewayIntentBits, Partials, type Message, type TextChannel } from 'discord.js'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from './aws.js'
import { CHANNEL_ID, CONFIG_TABLE, MENTION_COOLDOWN_MS } from './config.js'
import { CHARACTERS, discordTokenEnvVar, type CharacterName } from './characters.js'
import type { DiscordMessageContext } from './claude.js'

export type MentionHandler = (
  character: CharacterName,
  message: Message,
) => Promise<void>

const clients = new Map<CharacterName, Client>()
const lastMentionReplyAt = new Map<CharacterName, number>()

// ── Anonymous activity pulse ─────────────────────────────────────────────────
// Timestamps (only — no content, no authors) of human messages in the game
// channel, flushed to DynamoDB for the site's Discord ticker. Deliberately
// anonymous: the site shows *that* people are talking, never what they said.
const PULSE_KEY = 'discord_pulse'
const PULSE_FLUSH_MS = 5 * 60_000
const PULSE_WINDOW_MS = 24 * 3600_000
const PULSE_MAX = 500
let humanMessageTimes: number[] = []
let pulseDirty = false

function recordHumanMessage(): void {
  humanMessageTimes.push(Date.now())
  if (humanMessageTimes.length > PULSE_MAX) humanMessageTimes = humanMessageTimes.slice(-PULSE_MAX)
  pulseDirty = true
}

async function flushPulse(): Promise<void> {
  if (!pulseDirty) return
  pulseDirty = false
  const cutoff = Date.now() - PULSE_WINDOW_MS
  humanMessageTimes = humanMessageTimes.filter(t => t >= cutoff)
  try {
    await dynamo.send(new PutCommand({
      TableName: CONFIG_TABLE,
      Item: {
        key: PULSE_KEY,
        value: {
          count_24h: humanMessageTimes.length,
          last_at: humanMessageTimes.length > 0
            ? new Date(humanMessageTimes[humanMessageTimes.length - 1]).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        },
      },
    }))
  } catch (err) {
    console.error('[discord] pulse flush failed:', err)
    pulseDirty = true // retry next interval
  }
}

export function getClient(name: CharacterName): Client {
  const client = clients.get(name)
  if (!client) throw new Error(`Discord client for ${name} not started`)
  return client
}

async function getChannel(client: Client): Promise<TextChannel> {
  const channel = await client.channels.fetch(CHANNEL_ID())
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    throw new Error(`Channel ${CHANNEL_ID()} is not a guild text channel`)
  }
  return channel as TextChannel
}

export async function getRecentMessages(name: CharacterName, limit = 20): Promise<DiscordMessageContext[]> {
  try {
    const channel = await getChannel(getClient(name))
    const messages = await channel.messages.fetch({ limit })
    return [...messages.values()]
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .map(m => ({ author: m.author.username, content: m.cleanContent }))
  } catch (err) {
    console.error('[discord] failed to fetch recent messages:', err)
    return []
  }
}

export async function sendPost(name: CharacterName, text: string, replyTo?: Message): Promise<void> {
  if (replyTo) {
    await replyTo.reply({ content: text, allowedMentions: { repliedUser: true } })
    return
  }
  const channel = await getChannel(getClient(name))
  await channel.send(text)
}

/**
 * Start both bot clients. Requires the Message Content privileged intent to be
 * enabled for each application in the Discord Developer Portal.
 */
export async function startBots(onMention: MentionHandler): Promise<void> {
  for (const character of CHARACTERS) {
    const envVar = discordTokenEnvVar(character.name)
    const token = process.env[envVar]?.trim()
    if (!token) {
      console.warn(`[discord] ${envVar} not set — skipping ${character.name}`)
      continue
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    })

    // Both clients see every message — only the first character's client
    // counts activity, so humans aren't double-counted.
    const isPulseCounter = character.name === CHARACTERS[0].name

    client.on('messageCreate', async (message) => {
      try {
        if (message.author.bot) return // never respond to bots — prevents bot-to-bot loops
        if (message.channelId !== CHANNEL_ID()) return
        if (isPulseCounter) recordHumanMessage()
        if (!client.user || !message.mentions.has(client.user)) return

        const last = lastMentionReplyAt.get(character.name) ?? 0
        if (Date.now() - last < MENTION_COOLDOWN_MS) return
        lastMentionReplyAt.set(character.name, Date.now())

        await onMention(character.name, message)
      } catch (err) {
        console.error(`[discord] ${character.name} mention handler failed:`, err)
      }
    })

    client.on('clientReady', () => {
      console.log(`[discord] ${character.name} logged in as ${client.user?.tag}`)
    })

    await client.login(token)
    clients.set(character.name, client)
  }

  setInterval(() => void flushPulse(), PULSE_FLUSH_MS)
}
