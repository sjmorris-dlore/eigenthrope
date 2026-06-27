'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

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

function OnboardingInstructions() {
  return (
    <details className="group w-full max-w-2xl rounded-xl border border-zinc-200 bg-white px-5 py-4 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-zinc-900 marker:hidden dark:text-zinc-50">
        <span>Need a Xaman wallet?</span>
        <span className="text-xs uppercase tracking-[0.2em] text-zinc-400 group-open:hidden">
          Show
        </span>
        <span className="hidden text-xs uppercase tracking-[0.2em] text-zinc-400 group-open:inline">
          Hide
        </span>
      </summary>

      <div className="mt-5 space-y-5 border-t border-zinc-100 pt-5 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">
            Your wallet is your Observer identity.
          </p>
          <p className="mt-1">
            Eigenthrope does not use email or passwords. Xaman lets you connect, sign observations,
            build Resonance, and keep future artifacts in a wallet you control.
          </p>
        </div>

        <ol className="space-y-4">
          <li>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              1. Install Xaman on your phone
            </p>
            <p className="mt-1">
              Use Xaman&apos;s official setup guide for current App Store and Google Play links.
            </p>
            <a
              href="https://help.xaman.app/app/getting-started-with-xaman/installing-xumm"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex text-xs font-medium text-zinc-500 underline underline-offset-4 hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              Xaman installation guide
            </a>
          </li>

          <li>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              2. Create or import an XRPL account
            </p>
            <p className="mt-1">
              If Xaman shows recovery information, write it down somewhere offline. Eigenthrope
              cannot recover your wallet for you.
            </p>
            <a
              href="https://help.xaman.app/app/getting-started-with-xaman/your-first-xrp-ledger-account"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex text-xs font-medium text-zinc-500 underline underline-offset-4 hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              First XRPL account guide
            </a>
          </li>

          <li>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              3. Activate the account with XRP
            </p>
            <p className="mt-1">
              New XRPL accounts need a small XRP reserve before they can sign normal transactions.
              This is an XRP Ledger requirement, not an Eigenthrope fee.
            </p>
            <a
              href="https://help.xaman.app/app/getting-started-with-xaman/how-to-activate-a-new-xrpl-account"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex text-xs font-medium text-zinc-500 underline underline-offset-4 hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              Account activation guide
            </a>
          </li>

          <li>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">
              4. Return here and connect
            </p>
            <p className="mt-1">
              Press <span className="font-medium text-zinc-900 dark:text-zinc-50">Connect Xaman Wallet</span>,
              approve the connection in Xaman, then sign your first observation when you vote.
            </p>
          </li>
        </ol>

        <p className="rounded-lg bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          Each vote sends 1 drop of XRP, or 0.000001 XRP, to the Eigenthrope vault and also pays
          the tiny XRPL network fee shown in Xaman. If 1 XRP were worth $1, 1 drop would be
          $0.000001.
        </p>

        <p className="rounded-lg bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          Eigenthrope will never ask for your secret numbers, recovery phrase, family seed, or
          private key. Only sign requests you understand.
        </p>
      </div>
    </details>
  )
}

export default function WalletConnect({ onAccountChange }: WalletConnectProps) {
  const [account, setAccount] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const xummRef = useRef<XummInstance | null>(null)
  const [dbg, setDbg] = useState<string[]>(['—'])

  const log = useCallback((msg: string) => {
    const ts = new Date().toISOString().slice(11, 19)
    setDbg(prev => [...prev.slice(-9), `${ts} ${msg}`])
  }, [])

  // Always-fresh ref so event callbacks never capture a stale onAccountChange
  const onAccountChangeRef = useRef(onAccountChange)
  useEffect(() => { onAccountChangeRef.current = onAccountChange })

  const updateAccount = useCallback((value: string | null) => {
    const short = value ? value.slice(0, 8) : 'null'
    const cbType = typeof onAccountChangeRef.current
    log(`updateAccount(${short}) cb=${cbType}`)
    setAccount(value)
    onAccountChangeRef.current?.(value)
    log(`onAccountChange called → ${short}`)
  }, [log])

  // Extracted so it can be called both on mount and after disconnect
  const setupXumm = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_XAMAN_API_KEY
    if (!apiKey) { log('NO API KEY'); return }
    log('setupXumm start')

    const { XummPkce } = await import('xumm-oauth2-pkce')
    const xumm = new XummPkce(apiKey as string) as unknown as XummInstance
    xummRef.current = xumm
    log('xumm instance created')

    const handleSession = async () => {
      log('event:success/retrieved fired')
      let acct: string | null = null
      for (let i = 0; i < 5 && !acct; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 400))
        const s = await xumm.state()
        acct = s?.me?.account ?? null
        log(`event retry ${i}: acct=${acct ? acct.slice(0,8) : 'null'}`)
      }
      updateAccount(acct)
      setConnecting(false)
    }

    xumm.on('success', handleSession)
    xumm.on('retrieved', handleSession)
    xumm.on('loggedout', () => {
      log('event:loggedout')
      updateAccount(null)
      setConnecting(false)
    })
    xumm.on('error', () => {
      log('event:error')
      setConnecting(false)
    })

    // Handles returning from OAuth redirect and restored sessions
    const state = await xumm.state()
    const initAcct = state?.me?.account ?? null
    log(`init state()=${initAcct ? initAcct.slice(0,8) : 'null'}`)
    if (initAcct) {
      updateAccount(initAcct)
    }
  }, [updateAccount, log])

  useEffect(() => {
    setupXumm()
  }, [setupXumm])

  // Poll state() while connecting — fallback for when SDK events don't fire
  useEffect(() => {
    if (!connecting) return
    log('poll: start')
    let n = 0
    const interval = setInterval(async () => {
      if (!xummRef.current) return
      n++
      const s = await xummRef.current.state()
      const acct = s?.me?.account ?? null
      log(`poll#${n}: state=${acct ? acct.slice(0,8) : 'null'}`)
      if (acct) {
        clearInterval(interval)
        updateAccount(acct)
        setConnecting(false)
      }
    }, 1500)
    return () => { clearInterval(interval); log('poll: stop') }
  }, [connecting, updateAccount, log])

  const connect = () => {
    if (!xummRef.current) { log('connect: no xumm ref'); return }
    log('connect() called')
    setConnecting(true)
    xummRef.current.authorize()
  }

  const disconnect = () => {
    if (!xummRef.current) return
    log('disconnect() called')
    xummRef.current.logout()
    updateAccount(null)
    setupXumm()
  }

  const DebugPanel = () => (
    <pre className="w-full max-w-2xl rounded bg-zinc-900 p-3 text-[10px] leading-4 text-green-400 overflow-auto">
      {dbg.map((l, i) => <div key={i}>{l}</div>)}
    </pre>
  )

  if (account) {
    const short = `${account.slice(0, 6)}…${account.slice(-4)}`
    return (
      <div className="flex w-full flex-col items-center gap-3">
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
        <DebugPanel />
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
      <DebugPanel />
      <OnboardingInstructions />
    </div>
  )
}
