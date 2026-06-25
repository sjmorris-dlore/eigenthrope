/**
 * Creates the Eigenthrope S3 bucket for story files.
 * Story text is fetched server-side by the API — bucket stays private.
 *
 * Usage: node scripts/create-s3-bucket.mjs
 *
 * Requires EIGENTHROPE_S3_BUCKET in .env.local (must be globally unique).
 * Example: EIGENTHROPE_S3_BUCKET=eigenthrope-stories-sjm
 */

import {
  S3Client,
  CreateBucketCommand,
  PutPublicAccessBlockCommand,
} from '@aws-sdk/client-s3'
import { config } from 'dotenv'

config({ path: '.env.local' })

const bucket = process.env.EIGENTHROPE_S3_BUCKET
if (!bucket) { console.error('EIGENTHROPE_S3_BUCKET not set in .env.local'); process.exit(1) }

const s3 = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

console.log(`Creating bucket: ${bucket}`)
await s3.send(new CreateBucketCommand({ Bucket: bucket }))
console.log('Bucket created.')

await s3.send(new PutPublicAccessBlockCommand({
  Bucket: bucket,
  PublicAccessBlockConfiguration: {
    BlockPublicAcls: true,
    IgnorePublicAcls: true,
    BlockPublicPolicy: true,
    RestrictPublicBuckets: true,
  },
}))
console.log('Public access blocked (API fetches privately with AWS credentials).')
console.log(`\nDone. Add to Vercel env vars: EIGENTHROPE_S3_BUCKET=${bucket}`)
