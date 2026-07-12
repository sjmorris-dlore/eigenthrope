'use client'

import { useEffect, useState } from 'react'

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL

export const TICKER_PREF_KEY = 'eigenthrope-ticker'
export const TICKER_TOGGLE_EVENT = 'eigenthrope-ticker-toggle'

export function tickerEnabled(): boolean {
  try { return localStorage.getItem(TICKER_PREF_KEY) !== 'off' } catch { return true }
}

/**
 * Visitor preference for the floating Discord-activity bubbles. On by
 * default; the choice persists in localStorage like the theme. Broadcasts a
 * window event so an already-mounted ticker reacts immediately.
 */
export default function TickerToggle() {
  const [on, setOn] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setOn(tickerEnabled())
  }, [])

  const toggle = () => {
    const next = !on
    setOn(next)
    try { localStorage.setItem(TICKER_PREF_KEY, next ? 'on' : 'off') } catch {}
    window.dispatchEvent(new CustomEvent(TICKER_TOGGLE_EVENT, { detail: next }))
  }

  if (!DISCORD_URL) return null
  if (!mounted) return <div className="h-8 w-8" />

  return (
    <button
      onClick={toggle}
      aria-label={on ? 'Hide Discord activity bubbles' : 'Show Discord activity bubbles'}
      title={on ? 'Hide Discord activity bubbles' : 'Show Discord activity bubbles'}
      className={`rounded-full p-2 transition-colors ${
        on
          ? 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200'
          : 'text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400'
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        {!on && <line x1="3" y1="3" x2="21" y2="21" />}
      </svg>
    </button>
  )
}
