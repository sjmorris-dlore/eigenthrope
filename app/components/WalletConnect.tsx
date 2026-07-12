'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface XummState {
  me?: { account?: string }
  jwt?: string
}

interface XummInstance {
  on(event: 'success' | 'error' | 'retrieved' | 'loggedout', handler: () => void): void
  state(): Promise<XummState>
  authorize(): void
  logout(): void
}

interface WalletConnectProps {
  /** jwt is the Xaman session token — proof of wallet ownership for server writes */
  onAccountChange?: (account: string | null, jwt?: string | null) => void
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

  // Always-fresh ref so event callbacks never capture a stale onAccountChange
  const onAccountChangeRef = useRef(onAccountChange)
  useEffect(() => { onAccountChangeRef.current = onAccountChange })

  const updateAccount = useCallback((value: string | null, jwt?: string | null) => {
    setAccount(value)
    onAccountChangeRef.current?.(value, jwt)
  }, [])

  const setupXumm = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_XAMAN_API_KEY
    if (!apiKey) return

    const { XummPkce } = await import('xumm-oauth2-pkce')
    const xumm = new XummPkce(apiKey as string) as unknown as XummInstance
    xummRef.current = xumm

    const handleSession = async () => {
      let acct: string | null = null
      let jwt: string | null = null
      for (let i = 0; i < 5 && !acct; i++) {
        if (i > 0) await new Promise(r => setTimeout(r, 400))
        const s = await xumm.state()
        acct = s?.me?.account ?? null
        jwt = s?.jwt ?? null
      }
      updateAccount(acct, jwt)
      setConnecting(false)
    }

    xumm.on('success', handleSession)
    xumm.on('retrieved', handleSession)
    xumm.on('loggedout', () => { updateAccount(null, null); setConnecting(false) })
    xumm.on('error', () => { setConnecting(false) })

    const state = await xumm.state()
    if (state?.me?.account) {
      updateAccount(state.me.account, state.jwt ?? null)
    }
  }, [updateAccount])

  useEffect(() => {
    setupXumm()
  }, [setupXumm])

  // Poll state() while connecting — belt-and-suspenders for the mobile redirect flow
  // where the success event fires on the new page instance before handlers are ready
  useEffect(() => {
    if (!connecting) return
    const interval = setInterval(async () => {
      if (!xummRef.current) return
      const s = await xummRef.current.state()
      const acct = s?.me?.account ?? null
      if (acct) {
        clearInterval(interval)
        updateAccount(acct, s?.jwt ?? null)
        setConnecting(false)
      }
    }, 1500)
    return () => clearInterval(interval)
  }, [connecting, updateAccount])

  const connect = () => {
    if (!xummRef.current) return
    setConnecting(true)
    xummRef.current.authorize()
  }

  const disconnect = () => {
    if (!xummRef.current) return
    xummRef.current.logout()
    // The PKCE lib caches code_verifier and state in-memory on the singleton thread
    // AND in localStorage. Reusing them causes Xaman to reject the next auth request
    // (one-time-use values), returning error_description in the redirect instead of a code.
    // Clear both storage keys and delete window._XummPkce so setupXumm() creates a fresh
    // thread with empty in-memory state — same clean slate as a page reload.
    try { localStorage.removeItem('pkce_code_verifier') } catch { /* ignore */ }
    try { localStorage.removeItem('pkce_state') } catch { /* ignore */ }
    try { delete (window as unknown as Record<string, unknown>)._XummPkce } catch { /* ignore */ }
    xummRef.current = null
    updateAccount(null)
    setupXumm()
  }

  if (account) {
    const short = `${account.slice(0, 6)}…${account.slice(-4)}`
    return (
      <div className="flex w-full items-center justify-center gap-3">
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
      <OnboardingInstructions />
    </div>
  )
}
