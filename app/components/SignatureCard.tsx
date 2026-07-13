'use client'

import { useEffect, useState } from 'react'

interface Signatures {
  community: string
  player: string | null
}

/**
 * The observer's resonance signature overlaid on the community's — you (violet)
 * against the field (blue). Coordinates only; what the shapes measure stays
 * the game's secret.
 */
export default function SignatureCard({ account }: { account: string | null }) {
  const [sig, setSig] = useState<Signatures | null>(null)

  useEffect(() => {
    let cancelled = false
    const url = account ? `/api/signature?account=${encodeURIComponent(account)}` : '/api/signature'
    fetch(url)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data && !cancelled) setSig(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [account])

  if (!sig) return null

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
        Resonance Signature
      </p>
      <svg viewBox="0 0 32 32" className="mx-auto block h-36 w-36" aria-label="Resonance signatures">
        <title>Your signature against the field</title>
        <polygon
          points={sig.community}
          className="text-sky-500 dark:text-sky-400"
          fill="currentColor" fillOpacity="0.12"
          stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round"
        />
        {sig.player && (
          <polygon
            points={sig.player}
            className="text-violet-500 dark:text-violet-400"
            fill="currentColor" fillOpacity="0.15"
            stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round"
          />
        )}
      </svg>
      <div className="mt-3 flex items-center justify-center gap-4 text-[10px] uppercase tracking-wider text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-500 dark:bg-sky-400" /> the field
        </span>
        {sig.player ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-violet-500 dark:bg-violet-400" /> you
          </span>
        ) : (
          <span className="normal-case">connect to overlay yours</span>
        )}
      </div>
    </div>
  )
}
