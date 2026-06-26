import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { fetchStoryText } from '@/lib/s3'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'

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
  outcome_key?: string
  story_text?: string | null
  outcome_text?: string | null
}

interface UniverseRecord {
  universe_id: string
  title: string
  completed_at?: string
}

const proseComponents: Components = {
  h1: ({ children }) => (
    <p className="mb-5 mt-14 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400 first:mt-0">
      {children}
    </p>
  ),
  h2: ({ children }) => (
    <p className="mb-5 mt-12 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
      {children}
    </p>
  ),
  p: ({ children }) => (
    <p className="mb-6 text-lg leading-8 text-zinc-800 last:mb-0 dark:text-zinc-200">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-zinc-600 dark:text-zinc-400">{children}</em>
  ),
  hr: () => <hr className="my-12 border-zinc-200 dark:border-zinc-800" />,
}

async function getUniverse(id: string): Promise<UniverseRecord | null> {
  try {
    const result = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_universes',
      Key: { universe_id: id.toUpperCase() },
    }))
    const item = result.Item as UniverseRecord | undefined
    if (!item || (item as unknown as Record<string, string>).status !== 'completed') return null
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
      const [storyText, outcomeText] = await Promise.all([
        ch.story_key ? fetchStoryText(ch.story_key) : Promise.resolve(null),
        ch.outcome_key ? fetchStoryText(ch.outcome_key) : Promise.resolve(null),
      ])
      return { ...ch, story_text: storyText, outcome_text: outcomeText }
    })
  )
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
  const [u, chapters] = await Promise.all([
    getUniverse(universe),
    getChapters(universe),
  ])

  if (!u) notFound()

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 sm:px-8 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-16">

        {/* Header */}
        <div className="flex flex-col gap-6">
          <Link
            href="/archive"
            className="w-fit text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            ← Archive
          </Link>
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

                  {/* Chapter label */}
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
                    {ch.chapter_label}
                  </p>

                  {/* Story text */}
                  {ch.story_text && (
                    <ReactMarkdown components={proseComponents}>
                      {ch.story_text}
                    </ReactMarkdown>
                  )}

                  {/* The community's choice */}
                  {winningLabel && (
                    <div className="flex flex-col items-center gap-3 py-2">
                      <div className="h-px w-12 bg-zinc-300 dark:bg-zinc-700" />
                      <p className="text-xs italic text-zinc-400 dark:text-zinc-500">
                        The observers chose: {winningLabel}
                      </p>
                      <div className="h-px w-12 bg-zinc-300 dark:bg-zinc-700" />
                    </div>
                  )}

                  {/* Outcome text */}
                  {ch.outcome_text && (
                    <ReactMarkdown components={proseComponents}>
                      {ch.outcome_text}
                    </ReactMarkdown>
                  )}

                  {/* Chapter separator (not after the last one) */}
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

      </main>
    </div>
  )
}
