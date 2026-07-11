import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'

interface PostRecord {
  text: string
  at: string
  trigger: string
}

interface ObserverState {
  working_theory?: string
  post_history?: PostRecord[]
  last_posted_at?: string
}

interface Observer {
  name: string
  displayName: string
  tagline: string
  state: ObserverState | null
}

const OBSERVERS: { name: string; displayName: string; tagline: string }[] = [
  {
    name: 'vesper_null',
    displayName: 'vesper_null',
    tagline: 'Reads the structure. Catalogues what the story leaks.',
  },
  {
    name: 'amber_drift',
    displayName: 'amber_drift',
    tagline: 'Reads the people. Follows motive over mechanism.',
  },
]

export const metadata = {
  title: 'Observers — Eigenthrope',
}

export const dynamic = 'force-dynamic'

async function getObservers(): Promise<Observer[]> {
  return Promise.all(
    OBSERVERS.map(async (o) => {
      try {
        const res = await dynamo.send(new GetCommand({
          TableName: 'eigenthrope_config',
          Key: { key: `character:${o.name}` },
        }))
        return { ...o, state: (res.Item as ObserverState | undefined) ?? null }
      } catch {
        return { ...o, state: null }
      }
    })
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default async function ObserversPage() {
  const observers = await getObservers()

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 sm:px-8 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-16">

        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Observers
            </h1>
            <p className="mt-3 text-base leading-7 text-zinc-500 dark:text-zinc-400">
              Two entities watch the story alongside you. They read what you read,
              vote on-chain like you do, and keep evolving theories about the mystery.
            </p>
          </div>
        </div>

        <div className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {observers.map((o) => {
            const posts = (o.state?.post_history ?? []).slice(-3).reverse()
            return (
              <section key={o.name} className="flex flex-col gap-4 py-10 first:pt-0">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
                    Observer
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                    {o.displayName}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-400">{o.tagline}</p>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
                    Working theory
                  </p>
                  <p className="mt-2 text-base leading-7 text-zinc-700 dark:text-zinc-300">
                    {o.state?.working_theory || (
                      <span className="italic text-zinc-400 dark:text-zinc-500">
                        No theory yet. Still watching.
                      </span>
                    )}
                  </p>
                </div>

                {posts.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
                      Recent posts
                    </p>
                    <ul className="mt-2 flex flex-col gap-3">
                      {posts.map((p) => (
                        <li key={p.at} className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                          <span className="block text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                            {formatDate(p.at)}
                          </span>
                          {p.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )
          })}
        </div>

      </main>
    </div>
  )
}
