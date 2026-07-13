import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { fetchStoryText } from '@/lib/s3'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ArchiveChapterList from '@/app/components/ArchiveChapterList'
import DiscordTicker from '@/app/components/DiscordTicker'
import { publicChoices } from '@/lib/behavioral'

// Revalidate every 5 minutes so NFT ownership stays reasonably fresh
export const revalidate = 300

const XRPL_RPC = 'https://xrplcluster.com/'

interface Choice {
  label: string
  description: string
}

interface ChapterRecord {
  choice_point: string
  chapter: string
  chapter_label: string
  choices: Record<string, Choice>
  winning_choice?: string
  story_key?: string
  choice_outcomes?: Record<string, string>
  epilogue_key?: string
  story_text?: string | null
  outcome_text?: string | null  // winning choice's outcome, fetched server-side
  epilogue_text?: string | null
  field_glyph?: string  // the field's star at this chapter's close (polygon points)
}

interface UniverseRecord {
  universe_id: string
  title: string
  status: string
  completed_at?: string
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

async function getUniverse(id: string): Promise<UniverseRecord | null> {
  try {
    const result = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_universes',
      Key: { universe_id: id.toUpperCase() },
    }))
    const item = result.Item as UniverseRecord | undefined
    if (!item) return null
    return item
  } catch {
    return null
  }
}

async function getChapters(universeId: string): Promise<ChapterRecord[]> {
  const result = await dynamo.send(new ScanCommand({
    TableName: 'eigenthrope_chapters',
    FilterExpression: '#u = :universe AND #s = :closed',
    ExpressionAttributeNames: { '#u': 'universe', '#s': 'status' },
    ExpressionAttributeValues: {
      ':universe': universeId.toUpperCase(),
      ':closed': 'closed',
    },
  }))

  const chapters = ((result.Items ?? []) as ChapterRecord[])
    .sort((a, b) => a.chapter.localeCompare(b.chapter))

  return Promise.all(
    chapters.map(async (ch) => {
      const winningOutcomeKey = ch.winning_choice
        ? ch.choice_outcomes?.[ch.winning_choice]
        : undefined
      const [storyText, outcomeText, epilogueText] = await Promise.all([
        ch.story_key ? fetchStoryText(ch.story_key) : Promise.resolve(null),
        winningOutcomeKey ? fetchStoryText(winningOutcomeKey) : Promise.resolve(null),
        ch.epilogue_key ? fetchStoryText(ch.epilogue_key) : Promise.resolve(null),
      ])
      return { ...ch, story_text: storyText, outcome_text: outcomeText, epilogue_text: epilogueText }
    })
  )
}

// Returns unique current holders of winner NFTs (taxon 1) for this universe.
// Winner artifacts in DynamoDB have no artifact_type field (participation ones do).
async function getWinnerNFTHolders(universeId: string): Promise<string[]> {
  try {
    const result = await dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_artifacts',
      FilterExpression:
        'begins_with(choice_point, :prefix) AND #s = :claimed AND attribute_not_exists(artifact_type)',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':prefix': `${universeId.toUpperCase()}:`,
        ':claimed': 'claimed',
      },
      ProjectionExpression: 'nft_token_id',
    }))

    const tokenIds = (result.Items ?? [])
      .map((item) => item.nft_token_id as string)
      .filter(Boolean)

    if (tokenIds.length === 0) return []

    // Query current owner of each NFT from XRPL
    const owners = await Promise.all(
      tokenIds.map(async (nftId) => {
        try {
          const res = await fetch(XRPL_RPC, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method: 'nft_info',
              params: [{ nft_id: nftId }],
            }),
          })
          const data = await res.json()
          return data.result?.owner as string | undefined
        } catch {
          return undefined
        }
      })
    )

    return [...new Set(owners.filter((o): o is string => Boolean(o)))]
  } catch {
    return []
  }
}

export async function generateMetadata({ params }: { params: Promise<{ universe: string }> }) {
  const { universe } = await params
  const u = await getUniverse(universe)
  return { title: u ? `${u.title} — Eigenthrope Archive` : 'Archive — Eigenthrope' }
}

export default async function UniverseArchivePage({
  params,
}: {
  params: Promise<{ universe: string }>
}) {
  const { universe } = await params
  const [u, chapters, winnerHolders] = await Promise.all([
    getUniverse(universe),
    getChapters(universe),
    getWinnerNFTHolders(universe),
  ])

  if (!u) notFound()

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 sm:px-8 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-16">

        {/* Header */}
        <div className="flex flex-col gap-6">
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
              {u.universe_id}
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {u.title}
            </h1>
            {u.completed_at && (
              <p className="mt-3 text-xs text-zinc-400">
                {new Date(u.completed_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                })}
              </p>
            )}
          </div>
        </div>

        {/* Story */}
        {chapters.length === 0 ? (
          <p className="italic text-zinc-400">No story content yet.</p>
        ) : (
          <ArchiveChapterList chapters={chapters.map(ch => ({
            choice_point: ch.choice_point,
            chapter_label: ch.chapter_label,
            // Client-component props get serialized into the page — labels
            // and descriptions only, never the hidden behavioral weights
            choices: publicChoices(ch.choices),
            winning_choice: ch.winning_choice,
            story_text: ch.story_text,
            outcome_text: ch.outcome_text,
            epilogue_text: ch.epilogue_text,
            field_glyph: ch.field_glyph,
          }))} />
        )}

        {/* Winner artifact holders */}
        {winnerHolders.length > 0 && (
          <div className="flex flex-col gap-5 border-t border-zinc-200 pt-12 dark:border-zinc-800">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
              Winner Artifacts
            </p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {winnerHolders.length === 1
                ? 'One artifact from this universe is in circulation.'
                : `${winnerHolders.length} artifacts from this universe are in circulation.`}
            </p>
            <div className="flex flex-col gap-3">
              {winnerHolders.map((addr) => (
                <div key={addr} className="flex items-center justify-between gap-4">
                  <a
                    href={`https://bithomp.com/explorer/${addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-zinc-400 underline-offset-2 hover:underline dark:text-zinc-500"
                  >
                    {shortAddress(addr)}
                  </a>
                  <button
                    disabled
                    title="On-chain offers coming soon"
                    className="cursor-not-allowed rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-300 dark:border-zinc-800 dark:text-zinc-700"
                  >
                    Make an Offer
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
      <DiscordTicker />
    </div>
  )
}
