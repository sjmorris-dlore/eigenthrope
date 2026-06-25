/**
 * Pushes the voting deadline and next-chapter deadline out by N days.
 *
 * Usage: node scripts/extend-vote.mjs --days 2
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { config } from 'dotenv'

config({ path: '.env.local' })

function getArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : null
}

const days = parseFloat(getArg('--days') ?? '0')
if (!days || days <= 0) {
  console.error('Usage: node scripts/extend-vote.mjs --days N')
  process.exit(1)
}

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
}))

const configItem = await dynamo.send(new GetCommand({
  TableName: 'eigenthrope_config',
  Key: { key: 'active_choice_point' },
}))

if (!configItem.Item) {
  console.error('No active choice point.')
  process.exit(1)
}

const choicePoint = configItem.Item.value
const chapterItem = await dynamo.send(new GetCommand({
  TableName: 'eigenthrope_chapters',
  Key: { choice_point: choicePoint },
}))

if (!chapterItem.Item) {
  console.error('Chapter not found:', choicePoint)
  process.exit(1)
}

const chapter = chapterItem.Item
const extendMs = days * 24 * 60 * 60 * 1000
const newVotingClosesAt = new Date(new Date(chapter.voting_closes_at).getTime() + extendMs).toISOString()
const newNextChapterDueAt = new Date(new Date(chapter.next_chapter_due_at).getTime() + extendMs).toISOString()

await dynamo.send(new UpdateCommand({
  TableName: 'eigenthrope_chapters',
  Key: { choice_point: choicePoint },
  UpdateExpression: 'SET voting_closes_at = :vc, next_chapter_due_at = :nd',
  ExpressionAttributeValues: {
    ':vc': newVotingClosesAt,
    ':nd': newNextChapterDueAt,
  },
}))

console.log(`Extended ${choicePoint} by ${days} day(s).`)
console.log(`  Voting closes:     ${newVotingClosesAt}`)
console.log(`  Next chapter due:  ${newNextChapterDueAt}`)
