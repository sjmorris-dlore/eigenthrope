/**
 * Create or complete a universe record.
 *
 * Usage:
 *   node scripts/manage-universe.mjs --action create --universe U001 --title "The Meridian Incident"
 *   node scripts/manage-universe.mjs --action complete --universe U001
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { config } from 'dotenv'

config({ path: '.env.local' })

function getArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : null
}

const ACTION = getArg('--action')
const UNIVERSE = getArg('--universe')
const TITLE = getArg('--title')

if (!ACTION || !UNIVERSE) {
  console.error('Usage:')
  console.error('  node scripts/manage-universe.mjs --action create --universe U001 --title "My Title"')
  console.error('  node scripts/manage-universe.mjs --action complete --universe U001')
  process.exit(1)
}

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
}))

if (ACTION === 'create') {
  if (!TITLE) {
    console.error('--title is required for create')
    process.exit(1)
  }
  await dynamo.send(new PutCommand({
    TableName: 'eigenthrope_universes',
    Item: {
      universe_id: UNIVERSE,
      title: TITLE,
      status: 'active',
      created_at: new Date().toISOString(),
    },
  }))
  console.log(`Created universe ${UNIVERSE}: "${TITLE}"`)

} else if (ACTION === 'complete') {
  await dynamo.send(new UpdateCommand({
    TableName: 'eigenthrope_universes',
    Key: { universe_id: UNIVERSE },
    UpdateExpression: 'SET #s = :completed, completed_at = :now',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':completed': 'completed',
      ':now': new Date().toISOString(),
    },
  }))
  console.log(`Marked universe ${UNIVERSE} as completed.`)

} else {
  console.error(`Unknown action: ${ACTION}. Use 'create' or 'complete'.`)
  process.exit(1)
}
