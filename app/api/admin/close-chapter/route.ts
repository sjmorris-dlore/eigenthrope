import { headers } from 'next/headers'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return Response.json({ error: 'CRON_SECRET not configured' }, { status: 500 })

  const host = (await headers()).get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'

  const body = await request.json().catch(() => ({}))
  const url = `${protocol}://${host}/api/cron/close-choice-point${body.force ? '?force=true' : ''}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  })

  const data = await res.json()
  return Response.json(data, { status: res.status })
}
