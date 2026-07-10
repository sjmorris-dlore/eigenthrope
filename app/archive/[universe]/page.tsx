import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { fetchStoryText } from '@/lib/s3'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'

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
}

interface UniverseRecord {
  universe_id: string
  title: string
  status: string
  completed_at?: string
}

const storyComponents: Components = {
  h1: ({ children }) => (
    <p className="mb-4 mt-12 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400 first:mt-0">
      {children}
    </p>
  ),
  h2: ({ children }) => (
    <p className="mb-4 mt-10 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
      {children}
    </p>
  ),
  p: ({ children }) => (
    <p className="mb-5 text-base leading-7 text-zinc-800 last:mb-0 dark:text-zinc-200">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-bold text-zinc-900 dark:text-zinc-100">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-zinc-600 dark:text-zinc-400">{children}</em>
  ),
  hr: () => <hr className="my-10 border-zinc-200 dark:border-zinc-800" />,
}

function StoryCard({ text }: { text: string }) {
  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white px-8 py-10 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:px-12">
      <ReactMarkdown components={storyComponents}>{text}</ReactMarkdown>
    </div>
  )
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
          <div className="flex flex-col gap-20">
            {chapters.map((ch, i) => {
              const winningLabel = ch.winning_choice
                ? ch.choices[ch.winning_choice]?.label
                : null

              return (
                <div key={ch.choice_point} className="flex flex-col gap-10">

                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
                    {ch.chapter_label}
                  </p>

                  {ch.story_text && <StoryCard text={ch.story_text} />}

                  {winningLabel && (
                    <div className="flex flex-col items-center gap-3 py-2">
                      <div className="h-px w-12 bg-zinc-300 dark:bg-zinc-700" />
                      <p className="text-xs italic text-zinc-400 dark:text-zinc-500">
                        The observers chose: {winningLabel}
                      </p>
                      <div className="h-px w-12 bg-zinc-300 dark:bg-zinc-700" />
                    </div>
                  )}

                  {ch.outcome_text && <StoryCard text={ch.outcome_text} />}

                  {ch.epilogue_text && <StoryCard text={ch.epilogue_text} />}

                  {i < chapters.length - 1 && (
                    <div className="flex items-center gap-4">
                      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                      <span className="text-[10px] uppercase tracking-widest text-zinc-300 dark:text-zinc-700">
                        ✦
                      </span>
                      <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                    </div>
                  )}

                </div>
              )
            })}
          </div>
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
    </div>
  )
}
