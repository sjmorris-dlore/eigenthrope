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
const votingClosesAt = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString()
const nextChapterDueAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

await client.send(new PutCommand({
  TableName: 'eigenthrope_chapters',
  Item: {
    choice_point: choicePoint,
    universe: 'U001',
    chapter: 'C01',
    chapter_label: 'Chapter 1 · Choice Point',
    status: 'open',
    prompt: 'Evelyn has only one chance. She can finally ask Sentinel the questions she\'s carried in her notebook for months — or she can follow the mysterious stranger back toward the painting that first caught his attention.',
    choices: {
      A: {
        label: 'Interview Sentinel',
        description: 'For three months Evelyn has carried questions no reporter has ever asked Sentinel. If she lets this chance pass, she may never get another.',
      },
      B: {
        label: 'Follow the Stranger',
        description: 'The robbery is over. The stranger should be leaving with everyone else. Instead he\'s returning to the one place in the museum that seemed to matter to him before the robbery even began.',
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
