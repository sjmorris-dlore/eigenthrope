/**
 * One-off script: create the eigenthrope_clues DynamoDB table.
 * Run once: node create-clues-table.mjs
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb'

const dynamo = new DynamoDBClient({ region: 'us-east-1' })

try {
  await dynamo.send(new DescribeTableCommand({ TableName: 'eigenthrope_clues' }))
  console.log('Table already exists.')
} catch {
  await dynamo.send(new CreateTableCommand({
    TableName: 'eigenthrope_clues',
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'clue_id', AttributeType: 'S' },
      { AttributeName: 'category', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'clue_id', KeyType: 'HASH' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'category-index',
        KeySchema: [{ AttributeName: 'category', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
  }))
  console.log('Table created: eigenthrope_clues')
}
