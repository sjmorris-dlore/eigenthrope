'use client'

import { useState, useRef, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'

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

export interface ArchiveChapter {
  choice_point: string
  chapter_label: string
  choices: Record<string, { label: string; description: string }>
  winning_choice?: string
  story_text?: string | null
  outcome_text?: string | null
  epilogue_text?: string | null
  /** The field's resonance star as it stood at this chapter's close (polygon points) */
  field_glyph?: string
}

function ArchiveChapterCard({
  chapter,
  defaultExpanded,
}: {
  chapter: ArchiveChapter
  defaultExpanded: boolean
}) {
  const [collapsed, setCollapsed] = useState(!defaultExpanded)
  const [page, setPage] = useState(0)
  const [storyDone, setStoryDone] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)

  const pages = useMemo(
    () => (chapter.story_text ? splitPages(chapter.story_text) : []),
    [chapter.story_text],
  )
  const current = pages[page]
  const winningLabel = chapter.winning_choice
    ? (chapter.choices[chapter.winning_choice]?.label ?? null)
    : null

  // No story text means there's nothing to page through
  const effectiveDone = storyDone || pages.length === 0

  function changePage(next: number) {
    setPage(next)
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  function handleNext() {
    if (page < pages.length - 1) {
      changePage(page + 1)
    } else {
      setStoryDone(true)
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Story card — always visible, collapses/expands */}
      <div
        ref={topRef}
        className="w-full scroll-mt-16 rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-center justify-between px-8 pt-6 sm:px-12">
          <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
            {chapter.field_glyph && (
              <svg width="16" height="16" viewBox="0 0 32 32" className="shrink-0 text-sky-500 dark:text-sky-400" aria-label="The field's star at this close">
                <title>The field&apos;s star as it stood when this chapter closed</title>
                <polygon points={chapter.field_glyph} fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
            )}
            {chapter.chapter_label}
          </span>
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            {collapsed ? 'Read ↓' : 'Collapse ↑'}
          </button>
        </div>

        {/* Collapsed: show winning choice as a one-liner */}
        {(collapsed || effectiveDone) && winningLabel && (
          <p className="px-8 pb-6 pt-2 text-xs italic text-zinc-400 sm:px-12">
            The observers chose: {winningLabel}
          </p>
        )}
        {(collapsed || effectiveDone) && !winningLabel && (
          <div className="pb-6" />
        )}

        {/* Expanded + story in progress: paged reader */}
        {!collapsed && !effectiveDone && current && (
          <div className="px-8 pb-10 pt-4 text-left sm:px-12">
            {current.title && (
              <p className="mb-6 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
                {current.title}
              </p>
            )}
            <ReactMarkdown components={storyComponents}>{current.body}</ReactMarkdown>
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
                onClick={handleNext}
                className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                {page < pages.length - 1
                  ? `${pages[page + 1]?.title ?? 'Next'} →`
                  : 'See what happened →'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Outcome + epilogue — appear below once story is done */}
      {!collapsed && effectiveDone && (
        <>
          {winningLabel && (
            <div className="flex flex-col items-center gap-3 py-2">
              <div className="h-px w-12 bg-zinc-300 dark:bg-zinc-700" />
              <p className="text-xs italic text-zinc-400 dark:text-zinc-500">
                The observers chose: {winningLabel}
              </p>
              <div className="h-px w-12 bg-zinc-300 dark:bg-zinc-700" />
            </div>
          )}
          {chapter.outcome_text && (
            <div className="w-full rounded-xl border border-zinc-200 bg-white px-8 py-10 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:px-12">
              <ReactMarkdown components={storyComponents}>{chapter.outcome_text}</ReactMarkdown>
            </div>
          )}
          {chapter.epilogue_text && (
            <div className="w-full rounded-xl border border-zinc-200 bg-white px-8 py-10 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:px-12">
              <ReactMarkdown components={storyComponents}>{chapter.epilogue_text}</ReactMarkdown>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ArchiveChapterList({ chapters }: { chapters: ArchiveChapter[] }) {
  return (
    <div className="flex flex-col gap-20">
      {chapters.map((ch, i) => (
        <div key={ch.choice_point} className="flex flex-col gap-10">
          <ArchiveChapterCard
            chapter={ch}
            defaultExpanded={i === chapters.length - 1}
          />
          {i < chapters.length - 1 && (
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              <span className="text-[10px] uppercase tracking-widest text-zinc-300 dark:text-zinc-700">
                ✦
              </span>
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
