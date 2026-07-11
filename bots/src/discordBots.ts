import { Client, GatewayIntentBits, Partials, type Message, type TextChannel } from 'discord.js'
import { CHANNEL_ID, MENTION_COOLDOWN_MS } from './config.js'
import { CHARACTERS, discordTokenEnvVar, type CharacterName } from './characters.js'
import type { DiscordMessageContext } from './claude.js'

export type MentionHandler = (
  character: CharacterName,
  message: Message,
) => Promise<void>

const clients = new Map<CharacterName, Client>()
const lastMentionReplyAt = new Map<CharacterName, number>()

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

    client.on('messageCreate', async (message) => {
      try {
        if (message.author.bot) return // never respond to bots — prevents bot-to-bot loops
        if (message.channelId !== CHANNEL_ID()) return
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
}
