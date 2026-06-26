'use client'

import { useState } from 'react'
import WalletConnect from './WalletConnect'
import ObserverProfile from './ObserverProfile'
import ArtifactClaim from './ArtifactClaim'
import Vote from './Vote'
import WaveformDisplay from './WaveformDisplay'
import Tally from './Tally'

export default function App() {
  const [account, setAccount] = useState<string | null>(null)

  return (
    <div className="flex w-full flex-col gap-8">
      <WalletConnect onAccountChange={setAccount} />
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">

        {/* Main reading column */}
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {account && <ArtifactClaim account={account} />}
          {account && <Vote account={account} />}
          <Tally />
        </div>

        {/* Sticky sidebar */}
        <aside className="flex flex-col gap-4 lg:w-64 lg:shrink-0 lg:sticky lg:top-8">
          {account && (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <ObserverProfile account={account} />
            </div>
          )}
          <WaveformDisplay />
        </aside>

      </div>
    </div>
  )
}
