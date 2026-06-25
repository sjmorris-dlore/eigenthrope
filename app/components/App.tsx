'use client'

import { useState } from 'react'
import WalletConnect from './WalletConnect'
import Vote from './Vote'

export default function App() {
  const [account, setAccount] = useState<string | null>(null)

  return (
    <div className="flex w-full flex-col items-center gap-10">
      <WalletConnect onAccountChange={setAccount} />
      {account && <Vote account={account} />}
    </div>
  )
}
