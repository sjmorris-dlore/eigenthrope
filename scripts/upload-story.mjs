/**
 * Uploads a pre-vote story markdown file to S3 and sets story_key on the chapter record.
 * Run this when you open a new chapter — players will see the story immediately.
 *
 * Usage:
 *   node scripts/upload-story.mjs --choice-point U001:C01:CP1 --file story-files/U001-C01-story.md
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { readFileSync } from 'fs'
import { config } from 'dotenv'

config({ path: '.env.local' })

const args = process.argv.slice(2)
const cpIndex = args.indexOf('--choice-point')
const fileIndex = args.indexOf('--file')

if (cpIndex === -1 || fileIndex === -1) {
  console.error('Usage: node scripts/upload-story.mjs --choice-point U001:C01:CP1 --file story-files/U001-C01-story.md')
  process.exit(1)
}

const choicePoint = args[cpIndex + 1]
const filePath = args[fileIndex + 1]
const bucket = process.env.EIGENTHROPE_S3_BUCKET

if (!bucket) { console.error('EIGENTHROPE_S3_BUCKET not set.'); process.exit(1) }

const [universe, chapter] = choicePoint.split(':')
const s3Key = `${universe}/${chapter}/story.md`
const content = readFileSync(filePath, 'utf-8')

const s3 = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

process.stdout.write(`Uploading ${filePath} → s3://${bucket}/${s3Key}... `)
await s3.send(new PutObjectCommand({
  Bucket: bucket,
  Key: s3Key,
  Body: content,
  ContentType: 'text/markdown; charset=utf-8',
}))
console.log('done.')

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
}))

process.stdout.write(`Setting story_key on chapter ${choicePoint}... `)
await dynamo.send(new UpdateCommand({
  TableName: 'eigenthrope_chapters',
  Key: { choice_point: choicePoint },
  UpdateExpression: 'SET story_key = :k',
  ExpressionAttributeValues: { ':k': s3Key },
}))
console.log('done.')
console.log(`\nStory is live. Players will see it immediately.`)
