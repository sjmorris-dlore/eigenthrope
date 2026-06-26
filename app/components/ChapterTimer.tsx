'use client'

import { useState, useEffect } from 'react'

function timeRemaining(closesAt: string): string {
  const ms = new Date(closesAt).getTime() - Date.now()
  if (ms <= 0) return 'Voting has closed'
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  if (days > 0) return `${days} day${days !== 1 ? 's' : ''}${remainingHours > 0 ? `, ${remainingHours}h` : ''} remaining`
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''} remaining`
  const mins = Math.floor(ms / (1000 * 60))
  return mins > 1 ? `${mins} minutes remaining` : 'Less than a minute remaining'
}

export default function ChapterTimer({ className }: { className?: string }) {
  const [closesAt, setClosesAt] = useState<string | null>(null)
  const [label, setLabel] = useState<string>('')

  useEffect(() => {
    fetch('/api/chapter')
      .then(r => r.json())
      .then(data => {
        if (data.voting_closes_at && data.status === 'open') {
          setClosesAt(data.voting_closes_at)
          setLabel(timeRemaining(data.voting_closes_at))
        }
      })
      .catch(() => null)
  }, [])

  useEffect(() => {
    if (!closesAt) return
    const id = setInterval(() => setLabel(timeRemaining(closesAt)), 60_000)
    return () => clearInterval(id)
  }, [closesAt])

  if (!label || label === 'Voting has closed') return null

  return (
    <p className={`glow-pulse text-xs text-zinc-500 dark:text-zinc-400 ${className ?? ''}`}>
      {label}
    </p>
  )
}
