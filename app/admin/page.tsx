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

interface UniverseChapter {
  choice_point: string
  chapter: string
  chapter_label: string
  status: string
  voting_closes_at?: string
}

interface UniverseItem {
  universe_id: string
  title: string
  status: string
  chapters: UniverseChapter[]
}

// ─── shared primitives ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const open = status === 'open' || status === 'active'
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
      open
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400'
    }`}>
      {status}
    </span>
  )
}

function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
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

const smallInputClass =
  'w-full rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-600 dark:focus:border-zinc-500'

const monoInputClass =
  'w-full rounded border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-600 dark:focus:border-zinc-500'

const btnClass =
  'rounded bg-zinc-800 px-3 py-1.5 text-xs text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-700 dark:hover:bg-zinc-600'

const smallBtnClass =
  'rounded bg-zinc-800 px-2 py-1 text-[11px] text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-700 dark:hover:bg-zinc-600'

// ─── New chapter form ─────────────────────────────────────────────────────────

const LETTER_IDS = ['A', 'B', 'C', 'D']

function NewChapterForm({
  universeId,
  onCreated,
  onCancel,
}: {
  universeId: string
  onCreated: () => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [hours, setHours] = useState(24)
  const [choices, setChoices] = useState([
    { id: 'A', label: '', description: '' },
    { id: 'B', label: '', description: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateChoice(idx: number, field: 'label' | 'description', val: string) {
    setChoices(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c))
  }

  function addChoice() {
    if (choices.length >= 4) return
    setChoices(prev => [...prev, { id: LETTER_IDS[prev.length], label: '', description: '' }])
  }

  function removeChoice(idx: number) {
    if (choices.length <= 2) return
    setChoices(prev => prev.filter((_, i) => i !== idx).map((c, i) => ({ ...c, id: LETTER_IDS[i] })))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!label || !prompt || choices.some(c => !c.label)) {
      setError('Fill in all required fields.')
      return
    }
    setSaving(true)
    setError('')
    const choicesMap = Object.fromEntries(choices.map(c => [c.id, { label: c.label, description: c.description }]))
    const res = await fetch('/api/admin/chapters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ universe_id: universeId, chapter_label: label, prompt, choices: choicesMap, voting_hours: hours }),
    })
    const data = await res.json()
    if (res.ok) { onCreated() }
    else { setError(data.error ?? 'Failed'); setSaving(false) }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">New Chapter</p>
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Chapter label" className={smallInputClass} />
      <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Prompt — what are observers deciding?" rows={2} className={smallInputClass} />
      <div className="space-y-2">
        {choices.map((c, i) => (
          <div key={c.id} className="space-y-1">
            <div className="flex items-center gap-1">
              <span className="w-4 text-center text-[10px] font-bold text-zinc-400">{c.id}</span>
              <input value={c.label} onChange={e => updateChoice(i, 'label', e.target.value)} placeholder="Label" className={`${smallInputClass} flex-1`} />
              {choices.length > 2 && (
                <button type="button" onClick={() => removeChoice(i)} className="text-xs text-zinc-400 hover:text-red-500">✕</button>
              )}
            </div>
            <div className="pl-5">
              <input value={c.description} onChange={e => updateChoice(i, 'description', e.target.value)} placeholder="Description (optional)" className={smallInputClass} />
            </div>
          </div>
        ))}
        {choices.length < 4 && (
          <button type="button" onClick={addChoice} className="pl-5 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            + Add choice
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-zinc-500">Voting hours</label>
        <input type="number" value={hours} onChange={e => setHours(Number(e.target.value))} min={1} max={168}
          className="w-16 rounded border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-100" />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className={smallBtnClass}>{saving ? 'Creating…' : 'Create Chapter'}</button>
        <button type="button" onClick={onCancel} className="text-[11px] text-zinc-400 hover:text-zinc-600">Cancel</button>
      </div>
    </form>
  )
}

// ─── Universe nav ─────────────────────────────────────────────────────────────

function UniverseNav({
  activeChoicePoint,
  onActivate,
}: {
  activeChoicePoint: string | undefined
  onActivate: () => void
}) {
  const [universes, setUniverses] = useState<UniverseItem[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNewUniverse, setShowNewUniverse] = useState(false)
  const [newUniverseForm, setNewUniverseForm] = useState({ id: '', title: '' })
  const [creatingUniverse, setCreatingUniverse] = useState(false)
  const [universeError, setUniverseError] = useState('')
  const [newChapterFor, setNewChapterFor] = useState<string | null>(null)
  const [activating, setActivating] = useState<string | null>(null)
  const [renamingUniverse, setRenamingUniverse] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)

  const loadUniverses = useCallback(async () => {
    const res = await fetch('/api/admin/universes')
    if (res.ok) setUniverses(await res.json())
  }, [])

  useEffect(() => { loadUniverses() }, [loadUniverses])

  async function createUniverse(e: React.FormEvent) {
    e.preventDefault()
    if (!newUniverseForm.id || !newUniverseForm.title) return
    setCreatingUniverse(true)
    setUniverseError('')
    const res = await fetch('/api/admin/universes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ universe_id: newUniverseForm.id, title: newUniverseForm.title }),
    })
    const data = await res.json()
    if (res.ok) {
      setNewUniverseForm({ id: '', title: '' })
      setShowNewUniverse(false)
      setExpanded(data.universe_id)
      await loadUniverses()
    } else {
      setUniverseError(data.error ?? 'Failed to create.')
    }
    setCreatingUniverse(false)
  }

  async function activate(choicePoint: string) {
    setActivating(choicePoint)
    await fetch('/api/admin/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice_point: choicePoint }),
    })
    setActivating(null)
    onActivate()
  }

  return (
    <Section title="Universes">
      <div className="space-y-1">
        {universes.length === 0 && (
          <p className="text-xs text-zinc-400">No universes yet.</p>
        )}
        {universes.map(u => (
          <div key={u.universe_id}>
            <button
              onClick={() => setExpanded(expanded === u.universe_id ? null : u.universe_id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <span className="flex-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">{u.universe_id}</span>
              <span className="truncate text-[11px] text-zinc-400">{u.title}</span>
              <StatusBadge status={u.status} />
              <span className="text-[10px] text-zinc-400">{expanded === u.universe_id ? '▲' : '▼'}</span>
            </button>

            {expanded === u.universe_id && (
              <div className="ml-3 mt-1 space-y-2 border-l border-zinc-200 pl-3 dark:border-zinc-700">

                {/* Rename */}
                {renamingUniverse === u.universe_id ? (
                  <div className="flex items-center gap-2 py-1">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      className={`${smallInputClass} flex-1`}
                    />
                    <button
                      disabled={renaming}
                      onClick={async () => {
                        if (!renameValue.trim()) return
                        setRenaming(true)
                        await fetch('/api/admin/universes', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ universe_id: u.universe_id, title: renameValue }),
                        })
                        setRenamingUniverse(null)
                        setRenaming(false)
                        await loadUniverses()
                      }}
                      className={smallBtnClass}
                    >
                      {renaming ? '…' : 'Save'}
                    </button>
                    <button onClick={() => setRenamingUniverse(null)} className="text-[11px] text-zinc-400 hover:text-zinc-600">Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setRenamingUniverse(u.universe_id); setRenameValue(u.title) }}
                    className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    Rename: {u.title}
                  </button>
                )}
                {u.chapters.length === 0 && (
                  <p className="py-1 text-[11px] text-zinc-400">No chapters yet.</p>
                )}
                {u.chapters.map(ch => {
                  const isActive = ch.choice_point === activeChoicePoint
                  return (
                    <div key={ch.choice_point} className={`flex items-center gap-2 rounded px-2 py-1.5 ${isActive ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                          {ch.chapter_label || ch.choice_point}
                        </p>
                        <p className="font-mono text-[10px] text-zinc-400">{ch.choice_point}</p>
                      </div>
                      <StatusBadge status={ch.status} />
                      {isActive ? (
                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">active</span>
                      ) : (
                        <button
                          onClick={() => activate(ch.choice_point)}
                          disabled={activating === ch.choice_point}
                          className="rounded bg-zinc-200 px-2 py-0.5 text-[10px] text-zinc-700 hover:bg-zinc-300 disabled:opacity-40 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                        >
                          {activating === ch.choice_point ? '…' : 'Activate'}
                        </button>
                      )}
                    </div>
                  )
                })}

                {newChapterFor === u.universe_id ? (
                  <NewChapterForm
                    universeId={u.universe_id}
                    onCreated={async () => { setNewChapterFor(null); await loadUniverses() }}
                    onCancel={() => setNewChapterFor(null)}
                  />
                ) : (
                  <button
                    onClick={() => setNewChapterFor(u.universe_id)}
                    className="mt-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    + New chapter
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* New universe form */}
      {showNewUniverse ? (
        <form onSubmit={createUniverse} className="mt-4 space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          <input
            value={newUniverseForm.id}
            onChange={e => setNewUniverseForm(f => ({ ...f, id: e.target.value.toUpperCase() }))}
            placeholder="ID (e.g. U002)"
            className={smallInputClass}
          />
          <input
            value={newUniverseForm.title}
            onChange={e => setNewUniverseForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Title"
            className={smallInputClass}
          />
          {universeError && <p className="text-xs text-red-500">{universeError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={creatingUniverse} className={smallBtnClass}>
              {creatingUniverse ? 'Creating…' : 'Create Universe'}
            </button>
            <button type="button" onClick={() => { setShowNewUniverse(false); setUniverseError('') }} className="text-[11px] text-zinc-400 hover:text-zinc-600">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowNewUniverse(true)}
          className="mt-4 border-t border-zinc-200 pt-4 text-xs text-zinc-400 hover:text-zinc-600 dark:border-zinc-700 dark:hover:text-zinc-300"
        >
          + New universe
        </button>
      )}
    </Section>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

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
      if (chapterRes.ok) {
        const data = await chapterRes.json()
        setChapter(data)
        setLoadError('')
      } else {
        setLoadError('No active chapter found.')
      }
      if (tallyRes.ok) setTally(await tallyRes.json())
    } catch {
      setLoadError('Failed to load chapter data.')
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!chapter || chapter.choice_point === contentChoicePoint) return
    setContentChoicePoint(chapter.choice_point)
    // Clear stale content when switching chapters
    setStoryContent('')
    setChoiceIntroContent('')
    setChoiceContents({})
    setEpilogueContent('')

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

    if (!content.trim()) { setStatus('Error: Content is empty.'); return }

    setUploading(true)
    setStatus('')
    try {
      const res = await fetch('/api/admin/upload-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice_point: chapter.choice_point, type, content, choice_id }),
      })
      const data = await res.json()
      if (res.ok) { setStatus(`Uploaded → ${data.s3_key}`); await loadData() }
      else setStatus(`Error: ${data.error}`)
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
    } catch { setAnnounceStatus('Error: Request failed.') }
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
        setResetStatus(`Reset to rv=${data.reset_version}. Winner taxon ${data.winner_taxon}, participation ${data.participation_taxon}.`)
        await loadData()
      } else setResetStatus(`Error: ${data.error}`)
    } catch { setResetStatus('Error: Request failed.') }
    setResetting(false)
  }

  const total = tally ? Object.values(tally.counts).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-8 dark:bg-black sm:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Admin</h1>
          <button onClick={signOut} className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400">
            Sign out
          </button>
        </div>

        {/* Two-column grid */}
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">

          {/* Left: Universe nav */}
          <div className="lg:self-start">
            <UniverseNav
              activeChoicePoint={chapter?.choice_point}
              onActivate={loadData}
            />
          </div>

          {/* Right: chapter + content + actions */}
          <div className="space-y-6">

            {/* Active chapter */}
            <Section title="Active Chapter">
              {loadError ? (
                <p className="text-sm text-zinc-500">{loadError}</p>
              ) : !chapter ? (
                <p className="text-sm text-zinc-400">Loading…</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm text-zinc-600 dark:text-zinc-300">{chapter.choice_point}</span>
                    <StatusBadge status={chapter.status} />
                    {chapter.chapter_label && (
                      <span className="text-sm text-zinc-500">{chapter.chapter_label}</span>
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
                          <span className={`w-5 text-right font-mono text-xs ${isWinner ? 'text-amber-500' : 'text-zinc-400 dark:text-zinc-600'}`}>{id}</span>
                          <div className="flex-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className={isWinner ? 'text-zinc-900 dark:text-zinc-200' : 'text-zinc-600 dark:text-zinc-400'}>{c.label}</span>
                              <span className="text-zinc-400 dark:text-zinc-600">{count} ({pct}%)</span>
                            </div>
                            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                              <div
                                className={`h-full rounded-full transition-all ${isWinner ? 'bg-amber-400' : 'bg-zinc-400 dark:bg-zinc-600'}`}
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
                <div>
                  <label className="mb-1.5 block text-xs text-zinc-500">
                    Pre-choice story{chapter?.story_key ? ` — ${chapter.story_key}` : ' — not uploaded'}
                  </label>
                  <textarea value={storyContent} onChange={e => setStoryContent(e.target.value)}
                    placeholder="Shown to readers while voting is open…" rows={6} className={monoInputClass} />
                  <button onClick={() => uploadContent('story')} disabled={uploadingStory || !chapter} className={`mt-2 ${btnClass}`}>
                    {uploadingStory ? 'Uploading…' : 'Upload Story'}
                  </button>
                  <ActionStatus message={storyStatus} />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs text-zinc-500">
                    Choice intro{chapter?.choice_intro_key ? ` — ${chapter.choice_intro_key}` : ' — not uploaded'}
                  </label>
                  <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-600">
                    Narrative bridge before the voting options. Choice labels and descriptions render automatically below it.
                  </p>
                  <textarea value={choiceIntroContent} onChange={e => setChoiceIntroContent(e.target.value)}
                    placeholder="Evelyn has only one chance…" rows={4} className={monoInputClass} />
                  <button onClick={() => uploadContent('choice_intro')} disabled={uploadingChoiceIntro || !chapter} className={`mt-2 ${btnClass}`}>
                    {uploadingChoiceIntro ? 'Uploading…' : 'Upload Choice Intro'}
                  </button>
                  <ActionStatus message={choiceIntroStatus} />
                </div>

                {chapter && Object.entries(chapter.choices ?? {}).map(([id, c]) => {
                  const existingKey = chapter.choice_outcomes?.[id]
                  return (
                    <div key={id}>
                      <label className="mb-1.5 block text-xs text-zinc-500">
                        Outcome if <span className="font-semibold text-zinc-700 dark:text-zinc-300">{id} — {c.label}</span>
                        {existingKey ? ` — ${existingKey}` : ' — not uploaded'}
                      </label>
                      <textarea value={choiceContents[id] ?? ''} onChange={e => setChoiceContents(s => ({ ...s, [id]: e.target.value }))}
                        placeholder={`What happens if the community chose "${c.label}"…`} rows={6} className={monoInputClass} />
                      <button onClick={() => uploadContent('choice_outcome', id)} disabled={uploadingChoices[id] || !chapter} className={`mt-2 ${btnClass}`}>
                        {uploadingChoices[id] ? 'Uploading…' : `Upload Outcome ${id}`}
                      </button>
                      <ActionStatus message={choiceStatuses[id]} />
                    </div>
                  )
                })}

                <div>
                  <label className="mb-1.5 block text-xs text-zinc-500">
                    Epilogue{chapter?.epilogue_key ? ` — ${chapter.epilogue_key}` : ' — not uploaded'}
                  </label>
                  <textarea value={epilogueContent} onChange={e => setEpilogueContent(e.target.value)}
                    placeholder="Closing beats shown after the outcome, regardless of choice…" rows={6} className={monoInputClass} />
                  <button onClick={() => uploadContent('epilogue')} disabled={uploadingEpilogue || !chapter} className={`mt-2 ${btnClass}`}>
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
                  <p className="mb-2 text-xs text-zinc-500">Post chapter announcement to Discord with current prompt and choices.</p>
                  <button onClick={announce} disabled={announcing || !chapter}
                    className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500 disabled:opacity-40 dark:bg-indigo-800 dark:hover:bg-indigo-700">
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
                    <input type="number" value={resetHours} onChange={e => setResetHours(Number(e.target.value))} min={1} max={168}
                      className="w-20 rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500" />
                  </div>
                  <button onClick={resetGame} disabled={resetting || !chapter}
                    className="mt-2 rounded bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-500 disabled:opacity-40 dark:bg-red-900 dark:hover:bg-red-800">
                    {resetting ? 'Resetting…' : 'Reset Game'}
                  </button>
                  <ActionStatus message={resetStatus} />
                </div>
              </div>
            </Section>

          </div>
        </div>
      </div>
    </div>
  )
}
