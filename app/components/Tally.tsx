'use client'

import { useState, useEffect } from 'react'

interface TallyData {
  counts: Record<string, number>
  choices: Record<string, { label: string; description: string }>
}

export default function Tally() {
  const [tally, setTally] = useState<TallyData | null>(null)

  const fetchTally = async () => {
    const res = await fetch('/api/tally')
    if (res.ok) setTally(await res.json())
  }

  useEffect(() => {
    fetchTally()
    const interval = setInterval(fetchTally, 15000)
    return () => clearInterval(interval)
  }, [])

  if (!tally) return null

  const total = Object.values(tally.counts).reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const choiceIds = Object.keys(tally.choices).length > 0
    ? Object.keys(tally.choices)
    : Object.keys(tally.counts)

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <p className="text-center text-xs font-semibold uppercase tracking-widest text-zinc-400">
        Observer Tally
      </p>
      {choiceIds.map((choice) => {
        const count = tally.counts[choice] ?? 0
        const pct = total > 0 ? Math.round((count / total) * 100) : 0
        const label = tally.choices[choice]?.label ?? choice
        return (
          <div key={choice} className="flex items-center gap-3">
            <span className="w-6 text-xs font-semibold text-zinc-400">{choice}</span>
            <div className="h-2 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-2 rounded-full bg-zinc-900 transition-all duration-500 dark:bg-zinc-100"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-10 text-right text-xs text-zinc-500">{pct}%</span>
            <span className="text-xs text-zinc-400 hidden sm:inline truncate max-w-[120px]">{label}</span>
          </div>
        )
      })}
      <p className="text-center text-xs text-zinc-400">
        {total} observation{total !== 1 ? 's' : ''}
      </p>
    </div>
  )
}
