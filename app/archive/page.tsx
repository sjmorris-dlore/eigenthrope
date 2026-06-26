import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import Link from 'next/link'

interface UniverseRecord {
  universe_id: string
  title: string
  status: string
  completed_at?: string
}

export const metadata = {
  title: 'Archive — Eigenthrope',
}

async function getCompletedUniverses(): Promise<UniverseRecord[]> {
  try {
    const result = await dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_universes',
      FilterExpression: '#s = :completed',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':completed': 'completed' },
    }))
    return ((result.Items ?? []) as UniverseRecord[])
      .sort((a, b) => a.universe_id.localeCompare(b.universe_id))
  } catch {
    return []
  }
}

export default async function ArchivePage() {
  const universes = await getCompletedUniverses()

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 sm:px-8 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-16">

        <div className="flex flex-col gap-6">
          <Link
            href="/"
            className="w-fit text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            ← Eigenthrope
          </Link>
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
            No completed universes yet. The first universe is unfolding now.
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
                {u.completed_at && (
                  <p className="text-xs text-zinc-400">
                    {new Date(u.completed_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                    })}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}

      </main>
    </div>
  )
}
