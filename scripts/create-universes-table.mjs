/**
 * Creates the eigenthrope_universes DynamoDB table.
 * Safe to run more than once — skips if the table already exists.
 *
 * Usage: node scripts/create-universes-table.mjs
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb'
import { config } from 'dotenv'

config({ path: '.env.local' })

const client = new DynamoDBClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

try {
  await client.send(new DescribeTableCommand({ TableName: 'eigenthrope_universes' }))
  console.log('Table eigenthrope_universes already exists.')
} catch {
  await client.send(new CreateTableCommand({
    TableName: 'eigenthrope_universes',
    AttributeDefinitions: [{ AttributeName: 'universe_id', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'universe_id', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
  }))
  console.log('Created table eigenthrope_universes.')
}
