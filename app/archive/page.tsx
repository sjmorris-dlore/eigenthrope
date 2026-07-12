import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import Link from 'next/link'
import DiscordTicker from '@/app/components/DiscordTicker'

interface UniverseRecord {
  universe_id: string
  title: string
}

interface UniverseEntry {
  universe_id: string
  title: string
  episode_count: number
}

export const metadata = {
  title: 'Archive — Eigenthrope',
}

async function getUniversesWithClosedEpisodes(): Promise<UniverseEntry[]> {
  try {
    const chaptersResult = await dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_chapters',
      FilterExpression: '#s = :closed',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':closed': 'closed' },
      ProjectionExpression: 'universe',
    }))

    const chapters = (chaptersResult.Items ?? []) as { universe: string }[]
    if (chapters.length === 0) return []

    const countMap = new Map<string, number>()
    for (const ch of chapters) {
      countMap.set(ch.universe, (countMap.get(ch.universe) ?? 0) + 1)
    }

    const universeIds = [...countMap.keys()].sort()
    const universeRecords = await Promise.all(
      universeIds.map(id =>
        dynamo.send(new GetCommand({
          TableName: 'eigenthrope_universes',
          Key: { universe_id: id },
        }))
      )
    )

    return universeIds.map((id, i) => ({
      universe_id: id,
      title: (universeRecords[i].Item as UniverseRecord | undefined)?.title ?? id,
      episode_count: countMap.get(id)!,
    }))
  } catch {
    return []
  }
}

export default async function ArchivePage() {
  const universes = await getUniversesWithClosedEpisodes()

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 sm:px-8 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-16">

        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Archive
            </h1>
            <p className="mt-3 text-base leading-7 text-zinc-500 dark:text-zinc-400">
              Stories the community has already written.
            </p>
          </div>
        </div>

        {universes.length === 0 ? (
          <p className="text-base italic leading-7 text-zinc-400 dark:text-zinc-500">
            No completed episodes yet. The first universe is unfolding now.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {universes.map((u) => (
              <Link
                key={u.universe_id}
                href={`/archive/${u.universe_id.toLowerCase()}`}
                className="group flex flex-col gap-2 py-10 first:pt-0"
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
                  {u.universe_id}
                </p>
                <h2 className="text-2xl font-semibold text-zinc-900 transition-colors group-hover:text-zinc-600 dark:text-zinc-50 dark:group-hover:text-zinc-300">
                  {u.title}
                </h2>
                <p className="text-xs text-zinc-400">
                  {u.episode_count === 1 ? '1 episode completed' : `${u.episode_count} episodes completed`}
                </p>
              </Link>
            ))}
          </div>
        )}

      </main>
      <DiscordTicker />
    </div>
  )
}
