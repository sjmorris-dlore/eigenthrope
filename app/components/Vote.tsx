'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import type { ChapterData } from '@/app/api/chapter/route'
import ChapterTimer from './ChapterTimer'
import { useEpisodeNav } from './EpisodeContext'

interface VoteProps {
  account?: string | null
  onVoted?: () => void
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

function episodeLabel(choicePoint: string): string {
  const [u, e] = choicePoint.split(':')
  return `Universe ${parseInt(u.replace(/^U/, ''), 10)}, Episode ${parseInt(e.replace(/^E/, ''), 10)}`
}

function splitPages(text: string): Array<{ title: string; body: string }> {
  const chunks = text.split(/(?=^# )/m).filter(c => c.trim())
  return chunks.map(chunk => {
    const nl = chunk.indexOf('\n')
    const firstLine = nl === -1 ? chunk : chunk.slice(0, nl)
    const rest = nl === -1 ? '' : chunk.slice(nl + 1)
    if (firstLine.trimStart().startsWith('# ')) {
      return { title: firstLine.trim().slice(2).trim(), body: rest.trim() }
    }
    return { title: '', body: chunk.trim() }
  })
}

function StoryText({ text }: { text: string }) {
  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white px-8 py-10 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:px-12">
      <ReactMarkdown components={storyComponents}>{text}</ReactMarkdown>
    </div>
  )
}

function PagedStory({
  text,
  defaultCollapsed = false,
  onReadyChange,
}: {
  text: string
  defaultCollapsed?: boolean
  onReadyChange?: (ready: boolean) => void
}) {
  const pages = useMemo(() => splitPages(text), [text])
  const [page, setPage] = useState(0)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const topRef = useRef<HTMLDivElement>(null)
  const current = pages[page]

  const isReady = collapsed || page === pages.length - 1
  useEffect(() => { onReadyChange?.(isReady) }, [isReady, onReadyChange])

  function changePage(next: number) {
    setPage(next)
    // defer until after render so the new content is in place before scrolling
    setTimeout(() => {
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  return (
    <div ref={topRef} className="w-full scroll-mt-16 rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between px-8 pt-6 sm:px-12">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">Story</span>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          {collapsed ? 'Read ↓' : 'Collapse ↑'}
        </button>
      </div>
      {!collapsed && current && (
        <div className="px-8 pb-10 pt-4 text-left sm:px-12">
          {current.title && (
            <p className="mb-6 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
              {current.title}
            </p>
          )}
          <ReactMarkdown components={storyComponents}>{current.body}</ReactMarkdown>
          {pages.length > 1 && (
            <div className="mt-10 flex items-center justify-between">
              <button
                onClick={() => changePage(page - 1)}
                disabled={page === 0}
                className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 hover:text-zinc-600 disabled:invisible dark:hover:text-zinc-300"
              >
                ← {pages[page - 1]?.title ?? 'Back'}
              </button>
              <span className="text-[10px] text-zinc-300 dark:text-zinc-700">
                {page + 1} / {pages.length}
              </span>
              <button
                onClick={() => changePage(page + 1)}
                disabled={page === pages.length - 1}
                className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 hover:text-zinc-600 disabled:invisible dark:hover:text-zinc-300"
              >
                {pages[page + 1]?.title ?? 'Next'} →
              </button>
            </div>
          )}
        </div>
      )}
      {collapsed && <div className="px-8 pb-6 sm:px-12" />}
    </div>
  )
}

function ConclusionCard({
  predecessor,
  nextLabel,
  onAdvance,
}: {
  predecessor: NonNullable<ChapterData['predecessor']>
  nextLabel: string
  onAdvance: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  // chapter_label follows "Episode N · Title" — episodeLabel() supplies the
  // universe+episode, so keep just the title part when it's extractable.
  const titlePart = predecessor.chapter_label.includes('·')
    ? predecessor.chapter_label.split('·').slice(1).join('·').trim()
    : predecessor.chapter_label
  return (
    <div className="w-full rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between px-8 pt-6 sm:px-12">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
          {episodeLabel(predecessor.choice_point)} · {titlePart} — Conclusion
        </span>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          {collapsed ? 'Read ↓' : 'Collapse ↑'}
        </button>
      </div>
      {!collapsed && (
        <div className="px-8 pb-10 pt-4 text-left sm:px-12">
          {predecessor.outcome_text ? (
            <ReactMarkdown components={storyComponents}>{predecessor.outcome_text}</ReactMarkdown>
          ) : (
            <p className="text-sm italic text-zinc-500">The outcome is being written. Check back soon.</p>
          )}
          {predecessor.epilogue_text && (
            <ReactMarkdown components={storyComponents}>{predecessor.epilogue_text}</ReactMarkdown>
          )}
          <button
            onClick={onAdvance}
            className="mt-8 w-full rounded-lg bg-zinc-900 px-6 py-3 text-xs font-bold uppercase tracking-[0.2em] text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Continue to {nextLabel} →
          </button>
        </div>
      )}
      {collapsed && <div className="px-8 pb-6 sm:px-12" />}
    </div>
  )
}

export default function Vote({ account, onVoted }: VoteProps) {
  const { setNav } = useEpisodeNav()
  const [chapter, setChapter] = useState<ChapterData | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [signUrl, setSignUrl] = useState<string | null>(null)
  const [voted, setVoted] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [myVote, setMyVote] = useState<{ choice: string; label: string | null } | null>(null)
  const [changingVote, setChangingVote] = useState(false)
  const [votingReady, setVotingReady] = useState(false)
  const [conclusionVisible, setConclusionVisible] = useState(false)
  const [pendingAdvance, setPendingAdvance] = useState<ChapterData | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const advancePollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const signRef = useRef<HTMLDivElement>(null)

  const fetchMyVote = useCallback(async () => {
    if (!account) { setMyVote(null); return }
    const res = await fetch(`/api/my-vote?account=${encodeURIComponent(account)}`)
    if (res.ok) {
      const data = await res.json()
      setMyVote(data.choice ? data : null)
    }
  }, [account])

  useEffect(() => {
    if (qr) signRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [qr])

  const loadChapter = useCallback(() => {
    setChapter(null)
    setError(null)
    fetch('/api/chapter')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: ChapterData) => {
        setChapter(data)
        setNav({ authorLinkUrl: data.author_link_url, authorLinkLabel: data.author_link_label })
      })
      .catch(() => setError('Failed to load chapter.'))
  }, [])

  useEffect(() => {
    loadChapter()
    fetchMyVote()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [loadChapter, fetchMyVote])

  // Show voting once the reader is on the last story page (or there's no story / single page)
  useEffect(() => {
    if (!chapter) return
    if (!chapter.story_text) { setVotingReady(true); return }
    const pages = splitPages(chapter.story_text)
    setVotingReady(pages.length <= 1)
  }, [chapter])

  // Show conclusion card if the player voted in the predecessor chapter and
  // hasn't dismissed it. Keys are scoped by reset_version — a game reset
  // reopens the same choice points, and stale flags from a previous
  // iteration's votes must not resurrect old conclusion cards.
  useEffect(() => {
    if (!chapter?.predecessor) return
    const prevKey = `${chapter.predecessor.choice_point}_rv${chapter.reset_version ?? 0}`
    const votedPrev = localStorage.getItem(`voted_${prevKey}`)
    const dismissed = localStorage.getItem(`dismissed_conclusion_${prevKey}`)
    if (votedPrev === 'true' && dismissed !== 'true') {
      setConclusionVisible(true)
    }
  }, [chapter])

  // While the player has voted and the chapter is still open, poll for the advance
  useEffect(() => {
    if (!myVote || !chapter || chapter.status === 'closed' || pendingAdvance) return
    const currentKey = chapter.choice_point
    advancePollRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/chapter')
        if (!res.ok) return
        const data: ChapterData = await res.json()
        if (data.choice_point !== currentKey) {
          clearInterval(advancePollRef.current!)
          setPendingAdvance(data)
        }
      } catch { /* ignore transient errors */ }
    }, 10_000)
    return () => { if (advancePollRef.current) clearInterval(advancePollRef.current) }
  }, [myVote, chapter, pendingAdvance])

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
        localStorage.setItem(`voted_${chapter.choice_point}_rv${chapter.reset_version ?? 0}`, 'true')
        setVoted(choice)
        setChangingVote(false)
        setPending(null)
        setQr(null)
        setSignUrl(null)
        fetchMyVote()
        onVoted?.()
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
    if (error) {
      return (
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-sm text-zinc-500">{error}</p>
          <button
            onClick={loadChapter}
            className="text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Try again
          </button>
        </div>
      )
    }
    return <p className="text-sm text-zinc-400">Loading…</p>
  }

  if (chapter.status === 'closed') {
    return (
      <div className="flex w-full flex-col gap-6">
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
          {episodeLabel(chapter.choice_point)}
        </p>
        {chapter.story_text && <PagedStory text={chapter.story_text} defaultCollapsed />}
        {chapter.outcome_text ? (
          <StoryText text={chapter.outcome_text} />
        ) : (
          <p className="text-sm italic text-zinc-500">
            The outcome is being written. Check back soon.
          </p>
        )}
        {chapter.epilogue_text && <StoryText text={chapter.epilogue_text} />}
      </div>
    )
  }

  if (qr && signUrl) {
    return (
      <div ref={signRef} className="flex flex-col items-center gap-4">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Sign your observation in Xaman
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
        <p className="max-w-xs text-center text-xs text-zinc-400 dark:text-zinc-500">
          A sign request has been sent to your Xaman wallet. Open the app and approve it to record your vote on the ledger.
        </p>
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
          {episodeLabel(chapter.choice_point)}
        </p>
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Observation woven into the ledger.
        </p>
        <p className="text-sm text-zinc-500">{choiceLabel}</p>
        {pendingAdvance ? (
          <div className="mt-2 flex flex-col items-center gap-2">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">The voting has concluded.</p>
            <button
              onClick={() => {
                setNav({ authorLinkUrl: pendingAdvance.author_link_url, authorLinkLabel: pendingAdvance.author_link_label })
                setChapter(pendingAdvance)
                setVoted(null)
                setPendingAdvance(null)
              }}
              className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              See what happened →
            </button>
          </div>
        ) : (
          <>
            <p className="mt-2 max-w-xs text-sm text-zinc-400 dark:text-zinc-500">
              The conclusion of the story will be revealed once all votes are in and tallied.
            </p>
            <button
              onClick={() => { setVoted(null); setChangingVote(true) }}
              className="mt-2 text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Change observation
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
        {episodeLabel(chapter.choice_point)}
      </p>
      {conclusionVisible && chapter.predecessor ? (
        <ConclusionCard
          predecessor={chapter.predecessor}
          nextLabel={episodeLabel(chapter.choice_point)}
          onAdvance={() => {
            localStorage.setItem(`dismissed_conclusion_${chapter.predecessor!.choice_point}_rv${chapter.reset_version ?? 0}`, 'true')
            setConclusionVisible(false)
          }}
        />
      ) : null}
      {!conclusionVisible && chapter.story_text && (
        <PagedStory
          key={myVote ? 'voted' : 'fresh'}
          text={chapter.story_text}
          onReadyChange={setVotingReady}
          defaultCollapsed={!!myVote}
        />
      )}
      {!conclusionVisible && votingReady && account ? (
        myVote && !changingVote ? (
          // ── Compact "already voted" card ──────────────────────────────────
          <div className="w-full rounded-xl border border-zinc-200 bg-white px-8 py-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
              Collapse the Wave
            </p>
            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
              {myVote.label ?? myVote.choice}
            </p>
            {pendingAdvance ? (
              <div className="mt-3">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">The voting has concluded.</p>
                <button
                  onClick={() => {
                    setNav({ authorLinkUrl: pendingAdvance.author_link_url, authorLinkLabel: pendingAdvance.author_link_label })
                    setChapter(pendingAdvance)
                    setPendingAdvance(null)
                  }}
                  className="mt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  See what happened →
                </button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                The conclusion will be revealed once all votes are in and tallied.
              </p>
            )}
            {!pendingAdvance && (
              <button
                onClick={() => setChangingVote(true)}
                className="mt-4 text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                Change observation
              </button>
            )}
          </div>
        ) : (
          // ── Full voting card ──────────────────────────────────────────────
          <div className="w-full rounded-xl border border-zinc-200 bg-white px-8 py-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
              Collapse the Wave
            </p>
            {chapter.choice_intro_text && (
              <div className="mt-1">
                <ReactMarkdown components={storyComponents}>{chapter.choice_intro_text}</ReactMarkdown>
              </div>
            )}
            <ChapterTimer className="mt-2" />
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            <p className="mt-5 rounded-lg bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              Signing a vote sends 1 drop of XRP, or 0.000001 XRP, to the Eigenthrope vault and pays
              the tiny XRPL network fee shown in Xaman. If 1 XRP were worth $1, 1 drop would be
              $0.000001.
            </p>
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
            {myVote && (
              <button
                onClick={() => setChangingVote(false)}
                className="mt-4 text-xs text-zinc-400 underline hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                Cancel
              </button>
            )}
          </div>
        )
      ) : !conclusionVisible && votingReady ? (
        <div className="w-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-8 py-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Connect your Xaman wallet above to cast your vote and collapse the wave.
          </p>
        </div>
      ) : !conclusionVisible ? (
        <div className="w-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-8 py-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
            Collapse the Wave
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Voting unlocks once you've read the full episode.
          </p>
        </div>
      ) : null}
    </div>
  )
}
