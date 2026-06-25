'use client'

import { useState, useEffect, useRef } from 'react'

interface XummState {
  me?: { account?: string }
}

interface XummInstance {
  on(event: 'success' | 'error' | 'retrieved' | 'loggedout', handler: () => void): void
  state(): Promise<XummState>
  authorize(): void
  logout(): void
}

interface WalletConnectProps {
  onAccountChange?: (account: string | null) => void
}

export default function WalletConnect({ onAccountChange }: WalletConnectProps) {
  const [account, setAccount] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const xummRef = useRef<XummInstance | null>(null)

  const updateAccount = (value: string | null) => {
    setAccount(value)
    onAccountChange?.(value)
  }

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_XAMAN_API_KEY
    if (!apiKey) return

    async function init() {
      const { XummPkce } = await import('xumm-oauth2-pkce')
      const xumm = new XummPkce(apiKey as string) as unknown as XummInstance
      xummRef.current = xumm

      xumm.on('success', async () => {
        const state = await xumm.state()
        updateAccount(state?.me?.account ?? null)
        setConnecting(false)
      })

      xumm.on('error', () => {
        setConnecting(false)
      })

      // Handles returning from OAuth redirect and existing sessions
      const state = await xumm.state()
      if (state?.me?.account) {
        updateAccount(state.me.account)
      }
    }

    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const connect = () => {
    if (!xummRef.current) return
    setConnecting(true)
    xummRef.current.authorize()
  }

  const disconnect = () => {
    if (!xummRef.current) return
    xummRef.current.logout()
    updateAccount(null)
  }

  if (account) {
    const short = `${account.slice(0, 6)}…${account.slice(-4)}`
    return (
      <div className="flex items-center gap-3">
        <p className="font-mono text-xs text-zinc-400">{short}</p>
        <span className="text-zinc-300 dark:text-zinc-600">·</span>
        <button
          onClick={disconnect}
          className="text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Disconnect
        </button>
      </div>
    )
  }

  const apiKey = process.env.NEXT_PUBLIC_XAMAN_API_KEY
  const unconfigured = !apiKey

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Every observation is woven permanently into the XRP Ledger.
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-500">
          Connect your Xaman wallet to become an Observer.
        </p>
      </div>
      <button
        onClick={connect}
        disabled={connecting || unconfigured}
        title={unconfigured ? 'Set NEXT_PUBLIC_XAMAN_API_KEY to enable' : undefined}
        className="flex h-12 items-center justify-center rounded-full bg-zinc-900 px-8 text-base font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {connecting ? 'Connecting…' : 'Connect Xaman Wallet'}
      </button>
    </div>
  )
}
