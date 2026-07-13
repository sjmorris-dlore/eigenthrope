'use client'

import { useState } from 'react'
import WalletConnect from '@/app/components/WalletConnect'
import BazaarCard, { type BazaarCardData } from '@/app/components/BazaarCard'

/**
 * Client shell for the bazaar: an optional wallet connection pins purchases
 * to the connected wallet, so Xaman can't quietly sign with whichever
 * account happens to be active. Buying works without connecting — the
 * payload then warns to check the selected wallet.
 */
export default function BazaarGrid({ listings }: { listings: BazaarCardData[] }) {
  const [account, setAccount] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <WalletConnect onAccountChange={setAccount} />
        {!account && listings.length > 0 && (
          <p className="mt-2 text-xs text-zinc-400">
            Connecting is optional — but it guarantees purchases land in this wallet
            instead of whichever one is active in Xaman.
          </p>
        )}
      </div>

      {listings.length === 0 ? (
        <p className="text-base italic leading-7 text-zinc-400 dark:text-zinc-500">
          Nothing is for sale right now. Observers are holding.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {listings.map((l) => (
            <BazaarCard key={l.offer_index} listing={l} account={account} />
          ))}
        </div>
      )}
    </div>
  )
}
