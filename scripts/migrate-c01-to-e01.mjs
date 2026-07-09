/**
 * One-time migration: rename C01 → E01 in all DynamoDB items and S3 keys.
 *
 * Affected tables:
 *   eigenthrope_chapters  – choice_point PK, chapter field, S3 key fields
 *   eigenthrope_tallies   – choice_point PK
 *
 * Affected S3 paths (bucket: eigenthrope-stories-sjm):
 *   U001/C01/** → U001/E01/**
 *   U002/C01/** → U002/E01/**
 *   nft-images/U001/C01/** → nft-images/U001/E01/**
 *   nft-images/U002/C01/** → nft-images/U002/E01/**
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { S3Client, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

const REGION = 'us-east-1'
const BUCKET = 'eigenthrope-stories-sjm'
const CHAPTERS_TABLE = 'eigenthrope_chapters'
const TALLIES_TABLE = 'eigenthrope_tallies'

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))
const s3 = new S3Client({ region: REGION })

function renameKeys(value) {
  if (typeof value === 'string') return value.replace(/:C(\d+)/g, ':E$1').replace(/\/C(\d+)\//g, '/E$1/')
  if (Array.isArray(value)) return value.map(renameKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renameKeys(v)]))
  }
  return value
}

async function migrateTable(tableName, pkField) {
  const result = await dynamo.send(new ScanCommand({ TableName: tableName }))
  const items = result.Items ?? []
  const affected = items.filter(item => item[pkField]?.includes(':C'))
  console.log(`${tableName}: ${affected.length} item(s) to migrate`)

  for (const item of affected) {
    const newItem = renameKeys(item)
    console.log(`  ${item[pkField]} → ${newItem[pkField]}`)
    await dynamo.send(new PutCommand({ TableName: tableName, Item: newItem }))
    await dynamo.send(new DeleteCommand({ TableName: tableName, Key: { [pkField]: item[pkField] } }))
    console.log(`  done`)
  }
}

async function migrateS3Prefix(prefix) {
  const list = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }))
  const objects = list.Contents ?? []
  console.log(`S3 prefix "${prefix}": ${objects.length} object(s)`)

  for (const obj of objects) {
    const oldKey = obj.Key
    const newKey = oldKey.replace(/\/C(\d+)\//g, '/E$1/')
    if (oldKey === newKey) continue
    console.log(`  ${oldKey} → ${newKey}`)
    await s3.send(new CopyObjectCommand({ Bucket: BUCKET, CopySource: `${BUCKET}/${oldKey}`, Key: newKey }))
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: oldKey }))
  }
}

async function main() {
  console.log('=== Migrating S3 ===')
  await migrateS3Prefix('U001/C')
  await migrateS3Prefix('U002/C')
  await migrateS3Prefix('nft-images/U001/C')
  await migrateS3Prefix('nft-images/U002/C')

  console.log('\n=== Migrating DynamoDB ===')
  await migrateTable(CHAPTERS_TABLE, 'choice_point')
  await migrateTable(TALLIES_TABLE, 'choice_point')

  console.log('\nDone.')
}

main().catch(err => { console.error(err); process.exit(1) })
