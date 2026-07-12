'use client'

import { useEffect, useRef, useState } from 'react'
import { tickerEnabled, TICKER_TOGGLE_EVENT } from '@/app/components/TickerToggle'

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL

interface ObserverPost {
  author: string
  text: string
  at: string
}

interface Activity {
  posts: ObserverPost[]
  pulse: { count_24h: number; last_at: string | null }
}

interface Bubble {
  id: number
  kind: 'post' | 'pulse'
  author?: string
  text?: string
  /** horizontal offset so consecutive bubbles don't stack in one column */
  offset: number
}

const SPAWN_INTERVAL_MS = 14_000
const BUBBLE_LIFETIME_MS = 9_000
const SNIPPET_MAX_WORDS = 8

/** First few words of a post — the bubble is a teaser, not the full take. */
function snippet(text: string): string {
  const words = text.split(/\s+/)
  if (words.length <= SNIPPET_MAX_WORDS) return text
  return words.slice(0, SNIPPET_MAX_WORDS).join(' ') + ' …'
}

/**
 * TikTok-style Discord activity: observer posts (public by nature — the bots'
 * own words) float up alongside anonymous pulse bubbles for human activity.
 * Everything clicks through to the Discord invite. Renders nothing when
 * there's no invite URL, no data, or the visitor prefers reduced motion.
 */
export default function DiscordTicker() {
  const [activity, setActivity] = useState<Activity | null>(null)
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [reducedMotion, setReducedMotion] = useState(false)
  const [enabled, setEnabled] = useState(true)
  const nextId = useRef(0)
  const queueIndex = useRef(0)

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    setEnabled(tickerEnabled())
    const onToggle = (e: Event) => {
      const next = Boolean((e as CustomEvent).detail)
      setEnabled(next)
      if (!next) setBubbles([])
    }
    window.addEventListener(TICKER_TOGGLE_EVENT, onToggle)
    return () => window.removeEventListener(TICKER_TOGGLE_EVENT, onToggle)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch('/api/discord-activity')
        .then(r => (r.ok ? r.json() : null))
        .then(data => { if (data && !cancelled) setActivity(data) })
        .catch(() => {})
    }
    load()
    const refresh = setInterval(load, 5 * 60_000)
    return () => { cancelled = true; clearInterval(refresh) }
  }, [])

  useEffect(() => {
    if (!activity || reducedMotion || !DISCORD_URL || !enabled) return

    // Build the rotation: observer posts interleaved with pulse bubbles —
    // roughly one pulse per 3 human messages in the last 24h, capped.
    const queue: Omit<Bubble, 'id' | 'offset'>[] = activity.posts.map(p => ({
      kind: 'post' as const, author: p.author, text: p.text,
    }))
    const pulseCount = Math.min(4, Math.ceil(activity.pulse.count_24h / 3))
    for (let i = 0; i < pulseCount; i++) {
      queue.splice(Math.min(queue.length, (i + 1) * 2), 0, { kind: 'pulse' })
    }
    if (queue.length === 0) return

    const spawn = () => {
      const item = queue[queueIndex.current % queue.length]
      queueIndex.current++
      const id = nextId.current++
      const bubble: Bubble = { ...item, id, offset: (id % 3) * 28 }
      setBubbles(prev => [...prev.slice(-2), bubble])
      setTimeout(() => {
        setBubbles(prev => prev.filter(b => b.id !== id))
      }, BUBBLE_LIFETIME_MS)
    }

    spawn()
    const interval = setInterval(spawn, SPAWN_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [activity, reducedMotion, enabled])

  if (!DISCORD_URL || reducedMotion || !enabled || bubbles.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-0 right-2 z-40 h-[60vh] w-64 overflow-hidden sm:right-6">
      {bubbles.map(b => (
        <a
          key={b.id}
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto absolute bottom-0 block"
          style={{ right: `${b.offset}px`, animation: `ticker-float ${BUBBLE_LIFETIME_MS}ms linear forwards` }}
        >
          {b.kind === 'post' ? (
            <span className="block max-w-56 rounded-2xl border border-indigo-200 bg-white/90 px-3 py-2 shadow-sm backdrop-blur dark:border-indigo-900 dark:bg-zinc-900/90">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
                💬 {b.author}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                {snippet(b.text ?? '')}
              </span>
            </span>
          ) : (
            <span
              className="block rounded-full border border-indigo-200 bg-white/90 px-2.5 py-1.5 text-sm shadow-sm backdrop-blur dark:border-indigo-900 dark:bg-zinc-900/90"
              title="Observers are talking in the Discord"
            >
              💬
            </span>
          )}
        </a>
      ))}
    </div>
  )
}
