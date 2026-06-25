'use client'

import { useState, useEffect, useRef } from 'react'

const CHOICES = [
  {
    id: 'A',
    label: 'Follow the getaway car',
    description: 'Pursue the visible threat. End it here.',
  },
  {
    id: 'B',
    label: 'Search the building',
    description: 'Something happened inside while everyone watched the street.',
  },
]

interface VoteProps {
  account: string
}

export default function Vote({ account }: VoteProps) {
  const [pending, setPending] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [signUrl, setSignUrl] = useState<string | null>(null)
  const [voted, setVoted] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const castVote = async (choice: string) => {
    setError(null)
    setPending(choice)

    const res = await fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        universe: 'U001',
        chapter: 'C01',
        choicePoint: 'CP1',
        choice,
        account,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setError(JSON.stringify(err?.error ?? err) ?? `API error ${res.status}`)
      setPending(null)
      return
    }

    setQr(data.qr)
    setSignUrl(data.signUrl)

    intervalRef.current = setInterval(async () => {
      const status = await fetch(`/api/vote/${data.uuid}`)
      const s = await status.json()

      if (s.signed) {
        clearInterval(intervalRef.current!)
        setVoted(choice)
        setPending(null)
        setQr(null)
        setSignUrl(null)
      } else if (s.expired || s.rejected) {
        clearInterval(intervalRef.current!)
        setPending(null)
        setQr(null)
        setSignUrl(null)
      }
    }, 2000)
  }

  const cancel = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setPending(null)
    setQr(null)
    setSignUrl(null)
  }

  if (voted) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Vote recorded.
        </p>
        <p className="text-sm text-zinc-500">
          Choice {voted} — your observation is on-chain.
        </p>
      </div>
    )
  }

  if (qr && signUrl) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Scan with Xaman to sign your vote
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Xaman sign request QR code" width={180} height={180} />
        <a
          href={signUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-zinc-500 underline"
        >
          Open in Xaman
        </a>
        <button onClick={cancel} className="text-xs text-zinc-400 underline">
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
        Chapter 1 · Choice Point
      </p>
      <p className="max-w-sm text-center text-zinc-700 dark:text-zinc-300">
        The Hero stops the robbery. But something feels wrong. What does he do next?
      </p>
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
      <div className="flex w-full max-w-sm flex-col gap-3">
        {CHOICES.map((c) => (
          <button
            key={c.id}
            onClick={() => castVote(c.id)}
            disabled={pending !== null}
            className="flex flex-col gap-1 rounded-xl border border-zinc-200 p-4 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <span className="text-xs font-semibold text-zinc-400">
              Choice {c.id}
            </span>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              {c.label}
            </span>
            <span className="text-sm text-zinc-500">{c.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
