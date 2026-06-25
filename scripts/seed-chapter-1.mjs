import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import { config } from 'dotenv'

config({ path: '.env.local' })

const client = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
}))

const choicePoint = 'U001:C01:CP1'
const now = new Date()
const votingClosesAt = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString()
const nextChapterDueAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

await client.send(new PutCommand({
  TableName: 'eigenthrope_chapters',
  Item: {
    choice_point: choicePoint,
    universe: 'U001',
    chapter: 'C01',
    chapter_label: 'Chapter 1 · Choice Point',
    status: 'open',
    prompt: 'The Hero stops the robbery. But something feels wrong. What does he do next?',
    choices: {
      A: {
        label: 'Follow the getaway car',
        description: 'Pursue the visible threat. End it here.',
      },
      B: {
        label: 'Search the building',
        description: 'Something happened inside while everyone watched the street.',
      },
    },
    voting_opens_at: now.toISOString(),
    voting_closes_at: votingClosesAt,
    next_chapter_due_at: nextChapterDueAt,
    opened_at: now.toISOString(),
    closed_at: null,
  },
}))

await client.send(new PutCommand({
  TableName: 'eigenthrope_config',
  Item: {
    key: 'active_choice_point',
    value: choicePoint,
  },
}))

console.log('Seeded chapter 1 and set as active.')
