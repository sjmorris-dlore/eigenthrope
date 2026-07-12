// Announcements blast to every configured channel webhook: #announcements
// (DISCORD_WEBHOOK_URL) and #current-story (DISCORD_STORY_WEBHOOK_URL).
const WEBHOOK_URLS = [
  process.env.DISCORD_WEBHOOK_URL,
  process.env.DISCORD_STORY_WEBHOOK_URL,
].filter((u): u is string => Boolean(u?.trim()))

interface DiscordEmbed {
  title: string
  description?: string
  color?: number
  fields?: { name: string; value: string; inline?: boolean }[]
  footer?: { text: string }
  timestamp?: string
}

export async function postDiscord(embed: DiscordEmbed): Promise<void> {
  if (WEBHOOK_URLS.length === 0) {
    console.warn('[discord] no webhook URLs set — skipping notification')
    return
  }
  await Promise.all(WEBHOOK_URLS.map(async (url) => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      })
      if (!res.ok) {
        console.error(`[discord] webhook returned ${res.status}`)
      }
    } catch (err) {
      console.error('[discord] webhook failed:', err)
    }
  }))
}

const SITE_URL = 'https://eigenthrope.sjmorriswrites.com'

// The choices are deliberately NOT included — the announcement teases the
// decision; players see their options on the site with the story.
export function chapterOpenedEmbed(
  universe: string,
  chapterLabel: string,
  prompt: string,
  closesAt: string
): DiscordEmbed {
  const deadline = new Date(closesAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', timeZoneName: 'short',
  })

  return {
    title: `🔍 ${universe} · ${chapterLabel} — Voting is Open`,
    description: `*${prompt}*`,
    color: 0xFBBF24, // amber
    fields: [
      { name: 'Voting closes', value: deadline },
      { name: 'Read the story & vote', value: SITE_URL },
      { name: 'Story archive', value: `${SITE_URL}/archive` },
    ],
    timestamp: new Date().toISOString(),
  }
}

export function chapterClosedEmbed(
  universe: string,
  chapterLabel: string,
  winningChoice: string | null,
  winningLabel: string | null,
  finalTally: Record<string, number>
): DiscordEmbed {
  const total = Object.values(finalTally).reduce((a, b) => a + b, 0)
  const tallyLines = Object.entries(finalTally)
    .sort((a, b) => b[1] - a[1])
    .map(([id, weight]) => {
      const pct = total > 0 ? Math.round((weight / total) * 100) : 0
      const marker = id === winningChoice ? '▶ ' : '   '
      return `${marker}**${id}** — ${pct}%`
    })
    .join('\n')

  return {
    title: `📖 ${universe} · ${chapterLabel} — The Observers Have Spoken`,
    description: winningLabel
      ? `The community chose **${winningLabel}**.\n\nThe story continues.`
      : 'Voting has closed.',
    color: 0x6D28D9, // violet
    fields: [
      { name: 'Final tally', value: tallyLines || 'No votes recorded.' },
      { name: 'Read the outcome', value: SITE_URL },
      { name: 'Story archive', value: `${SITE_URL}/archive` },
    ],
    timestamp: new Date().toISOString(),
  }
}

export function gameResetEmbed(scope: 'chapter' | 'full', detail: string): DiscordEmbed {
  return {
    title: scope === 'full' ? '🔄 Game Reset' : '🔄 Voting Reset',
    description: detail,
    color: 0x71717A, // zinc — administrative, distinct from the story-beat colors above
    timestamp: new Date().toISOString(),
  }
}
