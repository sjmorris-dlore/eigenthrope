import { GetObjectCommand } from '@aws-sdk/client-s3'
import { s3, STORIES_BUCKET } from '@/lib/s3'

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get('key')
  if (!key) return new Response('key required', { status: 400 })
  if (!STORIES_BUCKET) return new Response('S3 not configured', { status: 500 })

  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: STORIES_BUCKET, Key: key }))
    if (!res.Body) return new Response('Not found', { status: 404 })
    return new Response(res.Body.transformToWebStream(), {
      headers: {
        'Content-Type': res.ContentType ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
