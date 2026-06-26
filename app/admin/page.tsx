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
  choice_intro_key?: string
  choice_outcomes?: Record<string, string>
  epilogue_key?: string
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
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
    }`}>
      {status}
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        {title}
      </h2>
      {children}
    </div>
  )
}

function ActionStatus({ message }: { message: string | undefined }) {
  if (!message) return null
  const isError = message.startsWith('Error')
  return (
    <p className={`mt-2 text-xs ${isError ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
      {message}
    </p>
  )
}

const inputClass =
  'w-full rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-600 dark:focus:border-zinc-500'

const monoInputClass =
  'w-full rounded border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-600 dark:focus:border-zinc-500'

const btnClass =
  'rounded bg-zinc-800 px-3 py-1.5 text-xs text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-700 dark:hover:bg-zinc-600'

export default function AdminPage() {
  const router = useRouter()
  const [chapter, setChapter] = useState<ChapterData | null>(null)
  const [tally, setTally] = useState<TallyData | null>(null)
  const [loadError, setLoadError] = useState('')

  const [storyContent, setStoryContent] = useState('')
  const [choiceIntroContent, setChoiceIntroContent] = useState('')
  const [choiceContents, setChoiceContents] = useState<Record<string, string>>({})
  const [epilogueContent, setEpilogueContent] = useState('')
  const [storyStatus, setStoryStatus] = useState('')
  const [choiceIntroStatus, setChoiceIntroStatus] = useState('')
  const [choiceStatuses, setChoiceStatuses] = useState<Record<string, string>>({})
  const [epilogueStatus, setEpilogueStatus] = useState('')

  const [announceStatus, setAnnounceStatus] = useState('')
  const [resetHours, setResetHours] = useState(24)
  const [resetStatus, setResetStatus] = useState('')

  const [uploadingStory, setUploadingStory] = useState(false)
  const [uploadingChoiceIntro, setUploadingChoiceIntro] = useState(false)
  const [uploadingChoices, setUploadingChoices] = useState<Record<string, boolean>>({})
  const [uploadingEpilogue, setUploadingEpilogue] = useState(false)
  const [announcing, setAnnouncing] = useState(false)
  const [resetting, setResetting] = useState(false)

  const [contentChoicePoint, setContentChoicePoint] = useState<string | null>(null)

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

  // Pre-populate textareas from S3 once per choice_point
  useEffect(() => {
    if (!chapter || chapter.choice_point === contentChoicePoint) return
    setContentChoicePoint(chapter.choice_point)

    fetch('/api/admin/chapter-content')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        if (data.story_text) setStoryContent(data.story_text)
        if (data.choice_intro_text) setChoiceIntroContent(data.choice_intro_text)
        if (data.epilogue_text) setEpilogueContent(data.epilogue_text)
        if (data.choice_outcome_texts) setChoiceContents(data.choice_outcome_texts)
      })
      .catch(() => {/* non-fatal */})
  }, [chapter, contentChoicePoint])

  async function signOut() {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    router.push('/admin/login')
  }

  async function uploadContent(
    type: 'story' | 'choice_intro' | 'choice_outcome' | 'epilogue',
    choice_id?: string
  ) {
    if (!chapter) return
    const content =
      type === 'story' ? storyContent
      : type === 'choice_intro' ? choiceIntroContent
      : type === 'epilogue' ? epilogueContent
      : choiceContents[choice_id!] ?? ''

    const setStatus =
      type === 'story' ? setStoryStatus
      : type === 'choice_intro' ? setChoiceIntroStatus
      : type === 'epilogue' ? setEpilogueStatus
      : (msg: string) => setChoiceStatuses(s => ({ ...s, [choice_id!]: msg }))

    const setUploading =
      type === 'story' ? setUploadingStory
      : type === 'choice_intro' ? setUploadingChoiceIntro
      : type === 'epilogue' ? setUploadingEpilogue
      : (v: boolean) => setUploadingChoices(s => ({ ...s, [choice_id!]: v }))

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
        body: JSON.stringify({ choice_point: chapter.choice_point, type, content, choice_id }),
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
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-8 dark:bg-black sm:px-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            Admin
          </h1>
          <button
            onClick={signOut}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
          >
            Sign out
          </button>
        </div>

        {/* Chapter status */}
        <Section title="Active Chapter">
          {loadError ? (
            <p className="text-sm text-zinc-500">{loadError}</p>
          ) : !chapter ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm text-zinc-600 dark:text-zinc-300">
                  {chapter.choice_point}
                </span>
                <StatusBadge status={chapter.status} />
                {chapter.chapter_label && (
                  <span className="text-sm text-zinc-500 dark:text-zinc-500">
                    {chapter.chapter_label}
                  </span>
                )}
              </div>
              <p className="text-sm italic text-zinc-500 dark:text-zinc-400">{chapter.prompt}</p>
              <div className="space-y-2">
                {Object.entries(chapter.choices ?? {}).map(([id, c]) => {
                  const count = tally?.counts?.[id] ?? 0
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0
                  const isWinner = chapter.winning_choice === id
                  return (
                    <div key={id} className="flex items-center gap-3">
                      <span className={`w-6 text-right font-mono text-xs ${
                        isWinner ? 'text-amber-500' : 'text-zinc-400 dark:text-zinc-600'
                      }`}>
                        {id}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={isWinner
                            ? 'text-zinc-900 dark:text-zinc-200'
                            : 'text-zinc-600 dark:text-zinc-400'
                          }>{c.label}</span>
                          <span className="text-zinc-400 dark:text-zinc-600">{count} ({pct}%)</span>
                        </div>
                        <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isWinner ? 'bg-amber-400' : 'bg-zinc-400 dark:bg-zinc-600'
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-zinc-400 dark:text-zinc-600">
                <span>Story: {chapter.story_key ?? 'not uploaded'}</span>
                <span>Epilogue: {chapter.epilogue_key ?? 'not uploaded'}</span>
              </div>
              {chapter.voting_closes_at && (
                <p className="text-xs text-zinc-400 dark:text-zinc-600">
                  Closes {new Date(chapter.voting_closes_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </Section>

        {/* Content upload */}
        <Section title="Content">
          <div className="space-y-6">

            {/* Pre-choice story */}
            <div>
              <label className="mb-1.5 block text-xs text-zinc-500">
                Pre-choice story{chapter?.story_key ? ` — ${chapter.story_key}` : ' — not uploaded'}
              </label>
              <textarea
                value={storyContent}
                onChange={e => setStoryContent(e.target.value)}
                placeholder="Shown to readers while voting is open…"
                rows={6}
                className={monoInputClass}
              />
              <button
                onClick={() => uploadContent('story')}
                disabled={uploadingStory || !chapter}
                className={`mt-2 ${btnClass}`}
              >
                {uploadingStory ? 'Uploading…' : 'Upload Story'}
              </button>
              <ActionStatus message={storyStatus} />
            </div>

            {/* Choice intro — narrative bridge before the vote buttons */}
            <div>
              <label className="mb-1.5 block text-xs text-zinc-500">
                Choice intro{chapter?.choice_intro_key ? ` — ${chapter.choice_intro_key}` : ' — not uploaded'}
              </label>
              <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-600">
                Short narrative bridge shown between the story and the voting options. Choice labels and descriptions are auto-rendered from the chapter data below it.
              </p>
              <textarea
                value={choiceIntroContent}
                onChange={e => setChoiceIntroContent(e.target.value)}
                placeholder="Evelyn has only one chance…"
                rows={4}
                className={monoInputClass}
              />
              <button
                onClick={() => uploadContent('choice_intro')}
                disabled={uploadingChoiceIntro || !chapter}
                className={`mt-2 ${btnClass}`}
              >
                {uploadingChoiceIntro ? 'Uploading…' : 'Upload Choice Intro'}
              </button>
              <ActionStatus message={choiceIntroStatus} />
            </div>

            {/* Per-choice outcomes */}
            {chapter && Object.entries(chapter.choices ?? {}).map(([id, c]) => {
              const existingKey = chapter.choice_outcomes?.[id]
              return (
                <div key={id}>
                  <label className="mb-1.5 block text-xs text-zinc-500">
                    Outcome if <span className="font-semibold text-zinc-700 dark:text-zinc-300">{id} — {c.label}</span>
                    {existingKey ? ` — ${existingKey}` : ' — not uploaded'}
                  </label>
                  <textarea
                    value={choiceContents[id] ?? ''}
                    onChange={e => setChoiceContents(s => ({ ...s, [id]: e.target.value }))}
                    placeholder={`What happens if the community chose "${c.label}"…`}
                    rows={6}
                    className={monoInputClass}
                  />
                  <button
                    onClick={() => uploadContent('choice_outcome', id)}
                    disabled={uploadingChoices[id] || !chapter}
                    className={`mt-2 ${btnClass}`}
                  >
                    {uploadingChoices[id] ? 'Uploading…' : `Upload Outcome ${id}`}
                  </button>
                  <ActionStatus message={choiceStatuses[id]} />
                </div>
              )
            })}

            {/* Shared epilogue */}
            <div>
              <label className="mb-1.5 block text-xs text-zinc-500">
                Epilogue (shared, shown after outcome){chapter?.epilogue_key ? ` — ${chapter.epilogue_key}` : ' — not uploaded'}
              </label>
              <textarea
                value={epilogueContent}
                onChange={e => setEpilogueContent(e.target.value)}
                placeholder="Closing beats that play out regardless of the choice made…"
                rows={6}
                className={monoInputClass}
              />
              <button
                onClick={() => uploadContent('epilogue')}
                disabled={uploadingEpilogue || !chapter}
                className={`mt-2 ${btnClass}`}
              >
                {uploadingEpilogue ? 'Uploading…' : 'Upload Epilogue'}
              </button>
              <ActionStatus message={epilogueStatus} />
            </div>

          </div>
        </Section>

        {/* Actions */}
        <Section title="Actions">
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-xs text-zinc-500">
                Post chapter announcement to Discord with current prompt and choices.
              </p>
              <button
                onClick={announce}
                disabled={announcing || !chapter}
                className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500 disabled:opacity-40 dark:bg-indigo-800 dark:hover:bg-indigo-700"
              >
                {announcing ? 'Announcing…' : 'Announce on Discord'}
              </button>
              <ActionStatus message={announceStatus} />
            </div>

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
                  className="w-20 rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500"
                />
              </div>
              <button
                onClick={resetGame}
                disabled={resetting || !chapter}
                className="mt-2 rounded bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-500 disabled:opacity-40 dark:bg-red-900 dark:hover:bg-red-800"
              >
                {resetting ? 'Resetting…' : 'Reset Game'}
              </button>
              <ActionStatus message={resetStatus} />
            </div>
          </div>
        </Section>

      </div>
    </div>
  )
}
