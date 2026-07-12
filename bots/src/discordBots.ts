import { Client, GatewayIntentBits, Partials, type Message, type TextChannel } from 'discord.js'
import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from './aws.js'
import {
  channelId, STORY_CHANNEL_ID, THEORIES_CHANNEL_ID, CONFIG_TABLE,
  MENTION_COOLDOWN_MS, REACTION_CHANCE, REACTION_COOLDOWN_MS, type ChannelKind,
} from './config.js'
import { CHARACTERS, discordTokenEnvVar, type CharacterName } from './characters.js'
import type { DiscordMessageContext } from './claude.js'

export type MentionHandler = (
  character: CharacterName,
  message: Message,
) => Promise<void>

const clients = new Map<CharacterName, Client>()
const lastMentionReplyAt = new Map<CharacterName, number>()
const lastReactionAt = new Map<CharacterName, number>()

/** Is this message in one of the game channels the bots watch? */
function watchedChannel(messageChannelId: string): boolean {
  return messageChannelId === STORY_CHANNEL_ID() ||
    (THEORIES_CHANNEL_ID() !== '' && messageChannelId === THEORIES_CHANNEL_ID())
}

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

async function getChannel(client: Client, kind: ChannelKind): Promise<TextChannel> {
  const id = channelId(kind)
  const channel = await client.channels.fetch(id)
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    throw new Error(`Channel ${id} (${kind}) is not a guild text channel`)
  }
  return channel as TextChannel
}

export async function getRecentMessages(name: CharacterName, kind: ChannelKind = 'story', limit = 20): Promise<DiscordMessageContext[]> {
  try {
    const channel = await getChannel(getClient(name), kind)
    const messages = await channel.messages.fetch({ limit })
    return [...messages.values()]
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .map(m => ({ author: m.author.username, content: m.cleanContent }))
  } catch (err) {
    console.error('[discord] failed to fetch recent messages:', err)
    return []
  }
}

export async function sendPost(name: CharacterName, text: string, kind: ChannelKind = 'story', replyTo?: Message): Promise<void> {
  if (replyTo) {
    await replyTo.reply({ content: text, allowedMentions: { repliedUser: true } })
    return
  }
  const channel = await getChannel(getClient(name), kind)
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
        if (!watchedChannel(message.channelId)) return
        if (isPulseCounter) recordHumanMessage()

        if (client.user && message.mentions.has(client.user)) {
          const last = lastMentionReplyAt.get(character.name) ?? 0
          if (Date.now() - last < MENTION_COOLDOWN_MS) return
          lastMentionReplyAt.set(character.name, Date.now())
          await onMention(character.name, message)
          return
        }

        // Not addressed to this bot: occasionally react with an emoji —
        // presence without noise. Each character rolls independently.
        const lastReact = lastReactionAt.get(character.name) ?? 0
        if (Math.random() < REACTION_CHANCE && Date.now() - lastReact >= REACTION_COOLDOWN_MS) {
          lastReactionAt.set(character.name, Date.now())
          const emoji = character.emojiSet[Math.floor(Math.random() * character.emojiSet.length)]
          await message.react(emoji)
          console.log(`[discord] ${character.name} reacted ${emoji} to a player message`)
        }
      } catch (err) {
        console.error(`[discord] ${character.name} message handler failed:`, err)
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
