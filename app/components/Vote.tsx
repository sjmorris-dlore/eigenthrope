'use client'

import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import type { ChapterData } from '@/app/api/chapter/route'

interface VoteProps {
  account: string
}

function timeRemaining(closesAt: string): string {
  const ms = new Date(closesAt).getTime() - Date.now()
  if (ms <= 0) return 'Voting has closed'
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days} day${days !== 1 ? 's' : ''} remaining`
  if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''} remaining`
  return 'Less than an hour remaining'
}

const storyComponents: Components = {
  h1: ({ children }) => (
    <p className="mb-4 mt-12 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400 first:mt-0">
      {children}
    </p>
  ),
  h2: ({ children }) => (
    <p className="mb-4 mt-10 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
      {children}
    </p>
  ),
  p: ({ children }) => (
    <p className="mb-5 text-base leading-7 text-zinc-800 dark:text-zinc-200 last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-bold text-zinc-900 dark:text-zinc-100">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-zinc-600 dark:text-zinc-400">{children}</em>
  ),
  hr: () => <hr className="my-10 border-zinc-200 dark:border-zinc-800" />,
}

function StoryText({ text }: { text: string }) {
  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white px-8 py-10 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:px-12">
      <ReactMarkdown components={storyComponents}>{text}</ReactMarkdown>
    </div>
  )
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

  if (chapter.status === 'closed') {
    return (
      <div className="flex w-full flex-col gap-6">
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
          {chapter.chapter_label}
        </p>
        {chapter.outcome_text ? (
          <StoryText text={chapter.outcome_text} />
        ) : (
          <p className="text-sm italic text-zinc-500">
            The outcome is being written. Check back soon.
          </p>
        )}
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

  if (voted) {
    const choiceLabel = chapter.choices[voted]?.label ?? voted
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          {chapter.chapter_label}
        </p>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Observation woven into the ledger.
        </p>
        <p className="text-sm text-zinc-500">{choiceLabel}</p>
        <button
          onClick={() => setVoted(null)}
          className="mt-2 text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Change observation
        </button>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
        {chapter.chapter_label}
      </p>
      {chapter.story_text && <StoryText text={chapter.story_text} />}
      <div className="w-full rounded-xl border border-zinc-200 bg-white px-8 py-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
          Your Observation
        </p>
        <p className="text-base leading-7 text-zinc-800 dark:text-zinc-200">
          {chapter.prompt}
        </p>
        {chapter.voting_closes_at && (
          <p className="mt-2 text-xs text-zinc-500">{timeRemaining(chapter.voting_closes_at)}</p>
        )}
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <div className="mt-6 flex flex-col gap-3">
          {Object.entries(chapter.choices).map(([id, choice]) => (
            <button
              key={id}
              onClick={() => castVote(id)}
              disabled={pending !== null}
              className="flex flex-col gap-1 rounded-xl border border-zinc-200 p-4 text-left transition-colors hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">Choice {id}</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{choice.label}</span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">{choice.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
