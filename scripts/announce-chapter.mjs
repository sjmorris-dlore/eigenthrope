/**
 * Posts a Discord announcement for the currently active choice point.
 * Run this after seeding a new chapter and setting active_choice_point.
 *
 * Usage: node scripts/announce-chapter.mjs
 *
 * Requires in .env.local:
 *   DISCORD_WEBHOOK_URL
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { config } from 'dotenv'

config({ path: '.env.local' })

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
}))

const SITE_URL = 'https://eigenstate.sjmorriswrites.com'

const configItem = await dynamo.send(new GetCommand({
  TableName: 'eigenthrope_config',
  Key: { key: 'active_choice_point' },
}))

if (!configItem.Item) {
  console.error('No active_choice_point set in config.')
  process.exit(1)
}

const choicePoint = configItem.Item.value
const chapterItem = await dynamo.send(new GetCommand({
  TableName: 'eigenthrope_chapters',
  Key: { choice_point: choicePoint },
}))

if (!chapterItem.Item) {
  console.error(`Chapter not found: ${choicePoint}`)
  process.exit(1)
}

const chapter = chapterItem.Item
const choices = chapter.choices ?? {}
const choiceLines = Object.entries(choices)
  .map(([id, c]) => `**${id}.** ${c.label} — *${c.description}*`)
  .join('\n')

const deadline = chapter.voting_closes_at
  ? new Date(chapter.voting_closes_at).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', timeZoneName: 'short',
    })
  : 'TBD'

const embed = {
  title: `🔍 ${chapter.chapter_label} — Voting is Open`,
  description: `*${chapter.prompt}*\n\n${choiceLines}`,
  color: 0xFBBF24,
  fields: [
    { name: 'Voting closes', value: deadline },
    { name: 'Cast your observation', value: SITE_URL },
  ],
  timestamp: new Date().toISOString(),
}

const webhookUrl = process.env.DISCORD_WEBHOOK_URL
if (!webhookUrl) {
  console.error('DISCORD_WEBHOOK_URL not set in .env.local')
  process.exit(1)
}

const res = await fetch(webhookUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ embeds: [embed] }),
})

if (res.ok) {
  console.log(`Posted announcement for ${choicePoint} to Discord.`)
} else {
  console.error(`Discord webhook returned ${res.status}`)
  process.exit(1)
}
