const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL

interface DiscordEmbed {
  title: string
  description?: string
  color?: number
  fields?: { name: string; value: string; inline?: boolean }[]
  footer?: { text: string }
  timestamp?: string
}

export async function postDiscord(embed: DiscordEmbed): Promise<void> {
  if (!WEBHOOK_URL) {
    console.warn('[discord] DISCORD_WEBHOOK_URL not set — skipping notification')
    return
  }
  try {
    const res = await fetch(WEBHOOK_URL, {
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
}

const SITE_URL = 'https://eigenstate.sjmorriswrites.com'

export function chapterOpenedEmbed(
  chapterLabel: string,
  prompt: string,
  choices: Record<string, { label: string; description: string }>,
  closesAt: string
): DiscordEmbed {
  const choiceLines = Object.entries(choices)
    .map(([id, c]) => `**${id}.** ${c.label} — *${c.description}*`)
    .join('\n')

  const deadline = new Date(closesAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', timeZoneName: 'short',
  })

  return {
    title: `🔍 ${chapterLabel} — Voting is Open`,
    description: `*${prompt}*\n\n${choiceLines}`,
    color: 0xFBBF24, // amber
    fields: [
      { name: 'Voting closes', value: deadline },
      { name: 'Cast your observation', value: SITE_URL },
    ],
    timestamp: new Date().toISOString(),
  }
}

export function chapterClosedEmbed(
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
    title: `📖 ${chapterLabel} — The Observers Have Spoken`,
    description: winningLabel
      ? `The community chose **${winningLabel}**.\n\nThe story continues.`
      : 'Voting has closed.',
    color: 0x6D28D9, // violet
    fields: [
      { name: 'Final tally', value: tallyLines || 'No votes recorded.' },
      { name: 'Read what happens next', value: SITE_URL },
    ],
    timestamp: new Date().toISOString(),
  }
}
