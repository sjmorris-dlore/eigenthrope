'use client'

import { useState, useEffect, useRef } from 'react'
import type { ChapterData } from '@/app/api/chapter/route'

interface VoteProps {
  account: string
}

export default function Vote({ account }: VoteProps) {
  const [chapter, setChapter] = useState<ChapterData | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [signUrl, setSignUrl] = useState<string | null>(null)
  const [voted, setVoted] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch('/api/chapter')
      .then((r) => r.json())
      .then(setChapter)
      .catch(() => setError('Failed to load chapter.'))

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const castVote = async (choice: string) => {
    if (!chapter) return
    setError(null)
    setPending(choice)

    let res: Response
    try {
      res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universe: chapter.universe,
          chapter: chapter.chapter,
          choicePoint: chapter.choice_point.split(':')[2],
          choice,
          account,
        }),
      })
    } catch {
      setError('Network error — please try again.')
      setPending(null)
      return
    }

    const data = await res.json()

    if (!res.ok) {
      setError(JSON.stringify(data?.error ?? data) ?? `API error ${res.status}`)
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

  if (!chapter) {
    return <p className="text-sm text-zinc-400">Loading…</p>
  }

  if (voted) {
    const choiceLabel = chapter?.choices[voted]?.label ?? voted
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          {chapter?.chapter_label}
        </p>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Observation woven into the ledger.
        </p>
        <p className="text-sm text-zinc-500">
          {choiceLabel}
        </p>
        <button
          onClick={() => setVoted(null)}
          className="mt-2 text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Change observation
        </button>
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

  if (chapter.status === 'closed') {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          {chapter.chapter_label}
        </p>
        <p className="text-sm text-zinc-500">Voting is closed for this choice point.</p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
        {chapter.chapter_label}
      </p>
      <p className="max-w-sm text-center text-zinc-700 dark:text-zinc-300">
        {chapter.prompt}
      </p>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex w-full max-w-sm flex-col gap-3">
        {Object.entries(chapter.choices).map(([id, choice]) => (
          <button
            key={id}
            onClick={() => castVote(id)}
            disabled={pending !== null}
            className="flex flex-col gap-1 rounded-xl border border-zinc-200 p-4 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            <span className="text-xs font-semibold text-zinc-400">Choice {id}</span>
            <span className="font-medium text-zinc-900 dark:text-zinc-50">{choice.label}</span>
            <span className="text-sm text-zinc-500">{choice.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
