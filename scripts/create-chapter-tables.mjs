import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb'
import { config } from 'dotenv'

config({ path: '.env.local' })

const client = new DynamoDBClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

const tables = [
  {
    TableName: 'eigenthrope_chapters',
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [{ AttributeName: 'choice_point', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'choice_point', KeyType: 'HASH' }],
  },
  {
    TableName: 'eigenthrope_config',
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [{ AttributeName: 'key', AttributeType: 'S' }],
    KeySchema: [{ AttributeName: 'key', KeyType: 'HASH' }],
  },
]

for (const table of tables) {
  const result = await client.send(new CreateTableCommand(table))
  console.log('Created:', result.TableDescription.TableName)
}
