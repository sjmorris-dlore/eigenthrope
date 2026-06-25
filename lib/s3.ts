import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

export const s3 = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

export const STORIES_BUCKET = process.env.EIGENTHROPE_S3_BUCKET ?? ''

export async function fetchStoryText(key: string): Promise<string | null> {
  if (!STORIES_BUCKET) return null
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: STORIES_BUCKET, Key: key }))
    return (await res.Body?.transformToString()) ?? null
  } catch (err) {
    console.error(`[s3] fetchStoryText failed for key "${key}" in bucket "${STORIES_BUCKET}":`, err)
    return null
  }
}

export async function putStoryText(key: string, content: string): Promise<void> {
  await s3.send(new PutObjectCommand({
    Bucket: STORIES_BUCKET,
    Key: key,
    Body: content,
    ContentType: 'text/markdown; charset=utf-8',
  }))
}
