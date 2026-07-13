import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion } from '@/lib/config'
import { fetchVaultTransactions } from '@/lib/resonance'
import {
  buildChapterWeightsIndex, profileFromChoices, signatureGlyphPoints,
  walletChoicesFromTransactions,
} from '@/lib/signature'

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

  // Observer signatures for the ticker bubbles — polygon points only
  const glyphs: Record<string, string> = {}
  try {
    const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
    const botsItem = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'bot_addresses' },
    }))
    const botAddresses = (botsItem.Item?.value ?? {}) as Record<string, string>
    if (vaultAddress && Object.keys(botAddresses).length > 0) {
      const [resetVersion, transactions, chapterScan] = await Promise.all([
        getResetVersion(),
        fetchVaultTransactions(vaultAddress, 400),
        dynamo.send(new ScanCommand({
          TableName: 'eigenthrope_chapters',
          ProjectionExpression: 'choice_point, universe, chapter, choices',
        })),
      ])
      const weightsIndex = buildChapterWeightsIndex(
        (chapterScan.Items ?? []) as Parameters<typeof buildChapterWeightsIndex>[0]
      )
      const walletChoices = walletChoicesFromTransactions(transactions, resetVersion)
      for (const [name, address] of Object.entries(botAddresses)) {
        glyphs[name] = signatureGlyphPoints(profileFromChoices(walletChoices.get(address), weightsIndex))
      }
    }
  } catch { /* glyphs are cosmetic — never fail the feed */ }

  return Response.json(
    {
      posts: posts.slice(0, 8),
      pulse: {
        count_24h: pulse?.count_24h ?? 0,
        last_at: pulse?.last_at ?? null,
      },
      glyphs,
    },
    { headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=300' } },
  )
}
