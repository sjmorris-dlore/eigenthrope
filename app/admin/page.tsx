'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Choice {
  label: string
  description: string
}

interface ChapterData {
  choice_point: string
  chapter_label: string
  status: 'open' | 'closed'
  prompt: string
  choices: Record<string, Choice>
  voting_closes_at: string
  story_key?: string
  outcome_key?: string
  winning_choice?: string
  final_tally?: Record<string, number>
}

interface TallyData {
  counts: Record<string, number>
  choices: Record<string, Choice>
  closed?: boolean
  winning_choice?: string
}

function StatusBadge({ status }: { status: 'open' | 'closed' }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${
      status === 'open'
        ? 'bg-emerald-900/50 text-emerald-400'
        : 'bg-zinc-700 text-zinc-400'
    }`}>
      {status}
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-500">{title}</h2>
      {children}
    </div>
  )
}

function ActionStatus({ message }: { message: string | undefined }) {
  if (!message) return null
  const isError = message.startsWith('Error')
  return (
    <p className={`mt-2 text-xs ${isError ? 'text-red-400' : 'text-emerald-400'}`}>{message}</p>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const [chapter, setChapter] = useState<ChapterData | null>(null)
  const [tally, setTally] = useState<TallyData | null>(null)
  const [loadError, setLoadError] = useState('')

  const [storyContent, setStoryContent] = useState('')
  const [outcomeContent, setOutcomeContent] = useState('')
  const [storyStatus, setStoryStatus] = useState('')
  const [outcomeStatus, setOutcomeStatus] = useState('')

  const [announceStatus, setAnnounceStatus] = useState('')
  const [resetHours, setResetHours] = useState(24)
  const [resetStatus, setResetStatus] = useState('')

  const [uploadingStory, setUploadingStory] = useState(false)
  const [uploadingOutcome, setUploadingOutcome] = useState(false)
  const [announcing, setAnnouncing] = useState(false)
  const [resetting, setResetting] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [chapterRes, tallyRes] = await Promise.all([
        fetch('/api/chapter'),
        fetch('/api/tally'),
      ])
      if (chapterRes.ok) setChapter(await chapterRes.json())
      else setLoadError('No active chapter found.')
      if (tallyRes.ok) setTally(await tallyRes.json())
    } catch {
      setLoadError('Failed to load chapter data.')
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function signOut() {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    router.push('/admin/login')
  }

  async function uploadContent(type: 'story' | 'outcome') {
    if (!chapter) return
    const content = type === 'story' ? storyContent : outcomeContent
    const setStatus = type === 'story' ? setStoryStatus : setOutcomeStatus
    const setUploading = type === 'story' ? setUploadingStory : setUploadingOutcome

    if (!content.trim()) {
      setStatus('Error: Content is empty.')
      return
    }

    setUploading(true)
    setStatus('')
    try {
      const res = await fetch('/api/admin/upload-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice_point: chapter.choice_point, type, content }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus(`Uploaded → ${data.s3_key}`)
        await loadData()
      } else {
        setStatus(`Error: ${data.error}`)
      }
    } catch {
      setStatus('Error: Upload failed.')
    }
    setUploading(false)
  }

  async function announce() {
    setAnnouncing(true)
    setAnnounceStatus('')
    try {
      const res = await fetch('/api/admin/announce', { method: 'POST' })
      const data = await res.json()
      if (res.ok) setAnnounceStatus(`Announced ${data.choice_point} to Discord.`)
      else setAnnounceStatus(`Error: ${data.error}`)
    } catch {
      setAnnounceStatus('Error: Request failed.')
    }
    setAnnouncing(false)
  }

  async function resetGame() {
    if (!confirm(`Reset game? This increments reset_version and reopens voting for ${resetHours}h.`)) return
    setResetting(true)
    setResetStatus('')
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voting_hours: resetHours }),
      })
      const data = await res.json()
      if (res.ok) {
        setResetStatus(
          `Reset to rv=${data.reset_version}. Winner taxon ${data.winner_taxon}, participation taxon ${data.participation_taxon}.`
        )
        await loadData()
      } else {
        setResetStatus(`Error: ${data.error}`)
      }
    } catch {
      setResetStatus('Error: Request failed.')
    }
    setResetting(false)
  }

  const total = tally ? Object.values(tally.counts).reduce((a, b) => a + b, 0) : 0

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-medium uppercase tracking-widest text-zinc-400">
            Eigenthrope Admin
          </h1>
          <button
            onClick={signOut}
            className="text-xs text-zinc-600 hover:text-zinc-400"
          >
            Sign out
          </button>
        </div>

        {/* Chapter status */}
        <Section title="Active Chapter">
          {loadError ? (
            <p className="text-sm text-zinc-500">{loadError}</p>
          ) : !chapter ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-zinc-300">{chapter.choice_point}</span>
                <StatusBadge status={chapter.status} />
                {chapter.chapter_label && (
                  <span className="text-sm text-zinc-500">{chapter.chapter_label}</span>
                )}
              </div>
              <p className="text-sm italic text-zinc-400">{chapter.prompt}</p>
              <div className="space-y-1.5">
                {Object.entries(chapter.choices ?? {}).map(([id, c]) => {
                  const count = tally?.counts?.[id] ?? 0
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0
                  const isWinner = chapter.winning_choice === id
                  return (
                    <div key={id} className="flex items-center gap-3">
                      <span className={`w-6 text-right text-xs font-mono ${isWinner ? 'text-amber-400' : 'text-zinc-600'}`}>
                        {id}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={isWinner ? 'text-zinc-200' : 'text-zinc-400'}>{c.label}</span>
                          <span className="text-zinc-600">{count} ({pct}%)</span>
                        </div>
                        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className={`h-full rounded-full transition-all ${isWinner ? 'bg-amber-500' : 'bg-zinc-600'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-4 text-xs text-zinc-600">
                <span>Story: {chapter.story_key ?? 'not uploaded'}</span>
                <span>Outcome: {chapter.outcome_key ?? 'not uploaded'}</span>
              </div>
              {chapter.voting_closes_at && (
                <p className="text-xs text-zinc-600">
                  Closes {new Date(chapter.voting_closes_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </Section>

        {/* Content upload */}
        <Section title="Content">
          <div className="space-y-5">
            {/* Story */}
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Story{chapter?.story_key ? ` — ${chapter.story_key}` : ' — not uploaded'}
              </label>
              <textarea
                value={storyContent}
                onChange={e => setStoryContent(e.target.value)}
                placeholder="Paste story markdown here…"
                rows={6}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
              <button
                onClick={() => uploadContent('story')}
                disabled={uploadingStory || !chapter}
                className="mt-2 rounded bg-zinc-700 px-3 py-1.5 text-xs text-zinc-100 hover:bg-zinc-600 disabled:opacity-40"
              >
                {uploadingStory ? 'Uploading…' : 'Upload Story'}
              </button>
              <ActionStatus message={storyStatus} />
            </div>

            {/* Outcome */}
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Outcome{chapter?.outcome_key ? ` — ${chapter.outcome_key}` : ' — not uploaded'}
              </label>
              <textarea
                value={outcomeContent}
                onChange={e => setOutcomeContent(e.target.value)}
                placeholder="Paste outcome markdown here…"
                rows={6}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
              <button
                onClick={() => uploadContent('outcome')}
                disabled={uploadingOutcome || !chapter}
                className="mt-2 rounded bg-zinc-700 px-3 py-1.5 text-xs text-zinc-100 hover:bg-zinc-600 disabled:opacity-40"
              >
                {uploadingOutcome ? 'Uploading…' : 'Upload Outcome'}
              </button>
              <ActionStatus message={outcomeStatus} />
            </div>
          </div>
        </Section>

        {/* Actions */}
        <Section title="Actions">
          <div className="space-y-5">
            {/* Discord announce */}
            <div>
              <p className="mb-2 text-xs text-zinc-500">
                Post chapter announcement to Discord with current prompt and choices.
              </p>
              <button
                onClick={announce}
                disabled={announcing || !chapter}
                className="rounded bg-indigo-800 px-3 py-1.5 text-xs text-zinc-100 hover:bg-indigo-700 disabled:opacity-40"
              >
                {announcing ? 'Announcing…' : 'Announce on Discord'}
              </button>
              <ActionStatus message={announceStatus} />
            </div>

            {/* Game reset */}
            <div>
              <p className="mb-2 text-xs text-zinc-500">
                Increment reset_version, reopen the current chapter, and bust tally cache.
                Existing blockchain votes are preserved but excluded from tallies and NFT minting.
              </p>
              <div className="flex items-center gap-3">
                <label className="text-xs text-zinc-500">Voting hours</label>
                <input
                  type="number"
                  value={resetHours}
                  onChange={e => setResetHours(Number(e.target.value))}
                  min={1}
                  max={168}
                  className="w-20 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 focus:border-zinc-500 focus:outline-none"
                />
              </div>
              <button
                onClick={resetGame}
                disabled={resetting || !chapter}
                className="mt-2 rounded bg-red-900 px-3 py-1.5 text-xs text-zinc-100 hover:bg-red-800 disabled:opacity-40"
              >
                {resetting ? 'Resetting…' : 'Reset Game'}
              </button>
              <ActionStatus message={resetStatus} />
            </div>
          </div>
        </Section>

      </div>
    </main>
  )
}
