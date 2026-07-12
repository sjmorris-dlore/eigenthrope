import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'

interface PostRecord {
  text: string
  at: string
}

interface ObserverPost {
  author: string
  text: string
  at: string
}

const OBSERVER_KEYS = ['character:vesper_null', 'character:amber_drift']

/**
 * Public feed for the site's Discord ticker. Deliberately limited to what's
 * already public: the observer bots' own posts (also visible in Discord and
 * on /observers) plus an anonymous count of human activity — never human
 * message content or usernames.
 */
export async function GET() {
  const [observerItems, pulseItem] = await Promise.all([
    Promise.all(OBSERVER_KEYS.map(key =>
      dynamo.send(new GetCommand({ TableName: 'eigenthrope_config', Key: { key } }))
        .catch(() => null)
    )),
    dynamo.send(new GetCommand({ TableName: 'eigenthrope_config', Key: { key: 'discord_pulse' } }))
      .catch(() => null),
  ])

  const posts: ObserverPost[] = []
  for (let i = 0; i < OBSERVER_KEYS.length; i++) {
    const item = observerItems[i]?.Item as { post_history?: PostRecord[] } | undefined
    const author = OBSERVER_KEYS[i].replace('character:', '')
    for (const p of (item?.post_history ?? []).slice(-5)) {
      posts.push({ author, text: p.text, at: p.at })
    }
  }
  posts.sort((a, b) => b.at.localeCompare(a.at))

  const pulse = (pulseItem?.Item?.value ?? null) as
    { count_24h?: number; last_at?: string | null } | null

  return Response.json(
    {
      posts: posts.slice(0, 8),
      pulse: {
        count_24h: pulse?.count_24h ?? 0,
        last_at: pulse?.last_at ?? null,
      },
    },
    { headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=300' } },
  )
}
