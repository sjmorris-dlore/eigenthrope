import Link from 'next/link'
import { getLeaderboard } from '@/lib/leaderboard'

export const metadata = {
  title: 'Leaderboard — Eigenthrope',
}

export const dynamic = 'force-dynamic'

function truncate(account: string): string {
  return `${account.slice(0, 5)}…${account.slice(-4)}`
}

export default async function LeaderboardPage() {
  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim() ?? ''
  const entries = vaultAddress ? await getLeaderboard(vaultAddress) : []

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 sm:px-8 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-16">

        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Leaderboard
            </h1>
            <p className="mt-3 text-base leading-7 text-zinc-500 dark:text-zinc-400">
              Resonance is standing: votes cast, artifacts held. It weights every
              observation you make. Set a display name on the{' '}
              <Link href="/wallet" className="underline underline-offset-4 hover:text-zinc-700 dark:hover:text-zinc-200">
                Artifacts page
              </Link>{' '}
              — otherwise you appear by wallet.
            </p>
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="text-base italic leading-7 text-zinc-400 dark:text-zinc-500">
            No observers yet this cycle. The first vote starts the board.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {entries.map((e, i) => (
              <div key={e.account} className="flex items-center gap-4 py-5 first:pt-0">
                <span className="w-8 text-right font-mono text-sm text-zinc-400">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
                    {e.bot_name ?? e.alias ?? truncate(e.account)}
                  </span>
                  <a
                    href={`https://xrpscan.com/account/${e.account}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    {truncate(e.account)}
                  </a>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{e.resonance}</p>
                  <p className="text-[11px] text-zinc-400">
                    {e.votes} vote{e.votes !== 1 ? 's' : ''}
                    {e.winner_artifacts > 0 && ` · ${e.winner_artifacts} 🏆`}
                    {e.participation_artifacts > 0 && ` · ${e.participation_artifacts} 🎫`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

      </main>
    </div>
  )
}
