import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { AWS_REGION, STORIES_BUCKET } from './config.js'

// Credentials resolve from the standard AWS env vars / provider chain.
// removeUndefinedValues: optional fields (e.g. a pending post's `context`)
// are legitimately undefined — without this the whole write throws.
export const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }), {
  marshallOptions: { removeUndefinedValues: true },
})

const s3 = new S3Client({ region: AWS_REGION })
const secrets = new SecretsManagerClient({ region: AWS_REGION })

export async function fetchStoryText(key: string): Promise<string | null> {
  if (!STORIES_BUCKET || !key) return null
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: STORIES_BUCKET, Key: key }))
    return (await res.Body?.transformToString()) ?? null
  } catch (err) {
    console.error(`[s3] fetchStoryText failed for "${key}":`, err)
    return null
  }
}

/**
 * Fetch an XRPL wallet seed from Secrets Manager. Accepts either a raw seed
 * string or a JSON object with a `seed` field.
 */
export async function fetchWalletSeed(secretName: string): Promise<string> {
  const res = await secrets.send(new GetSecretValueCommand({ SecretId: secretName }))
  const raw = res.SecretString
  if (!raw) throw new Error(`Secret "${secretName}" has no string value`)
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.seed === 'string') {
      return parsed.seed
    }
  } catch { /* raw seed string */ }
  return raw.trim()
}
