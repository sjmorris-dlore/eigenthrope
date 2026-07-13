import Link from 'next/link'
import { getBazaarListings } from '@/lib/bazaar'
import BazaarGrid from '@/app/components/BazaarGrid'

export const metadata = {
  title: 'Bazaar — Eigenthrope',
}

export const dynamic = 'force-dynamic'

function truncate(account: string): string {
  return `${account.slice(0, 5)}…${account.slice(-4)}`
}

export default async function BazaarPage() {
  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim() ?? ''
  const listings = vaultAddress ? await getBazaarListings(vaultAddress) : []

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 sm:px-8 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-16">

        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Bazaar
            </h1>
            <p className="mt-3 text-base leading-7 text-zinc-500 dark:text-zinc-400">
              Artifacts changing hands. Every artifact carries resonance — buying one
              buys standing on the{' '}
              <Link href="/leaderboard" className="underline underline-offset-4 hover:text-zinc-700 dark:hover:text-zinc-200">
                leaderboard
              </Link>
              . List your own from the{' '}
              <Link href="/wallet" className="underline underline-offset-4 hover:text-zinc-700 dark:hover:text-zinc-200">
                Artifacts page
              </Link>
              . Trades settle wallet-to-wallet on the XRP Ledger — the game takes nothing.
            </p>
          </div>
        </div>

        <BazaarGrid
          listings={listings.map((l) => ({
            offer_index: l.offer_index,
            chapter_label: l.chapter_label,
            choice_point: l.choice_point,
            artifact_type: l.artifact_type,
            image_key: l.image_key,
            amount_drops: l.amount_drops,
            seller: l.seller,
            seller_display: l.seller_alias ?? truncate(l.seller),
          }))}
        />

      </main>
    </div>
  )
}
