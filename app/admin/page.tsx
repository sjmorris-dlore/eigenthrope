'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { LibraryChapter } from '@/app/api/admin/nft-library/route'
import { BEHAVIORAL_TRAITS } from '@/lib/behavioral'
import type { BehavioralWeights } from '@/lib/behavioral'
import AdminRecordJudge from '@/app/components/AdminRecordJudge'

interface Choice {
  label: string
  description: string
  /** Stable identifier for story conditionals, e.g. "HonorAutonomy" */
  name?: string
  behavioral_weights?: BehavioralWeights
}

const CHOICE_NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/

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
  author_link_url?: string
  author_link_label?: string
}

interface TallyData {
  counts: Record<string, number>
  voter_count?: number
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

// ─── New episode form ─────────────────────────────────────────────────────────

const LETTER_IDS = ['A', 'B', 'C', 'D']

function NewEpisodeForm({
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
    { id: 'A', label: '', description: '', name: '' },
    { id: 'B', label: '', description: '', name: '' },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function updateChoice(idx: number, field: 'label' | 'description' | 'name', val: string) {
    setChoices(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c))
  }

  function addChoice() {
    if (choices.length >= 4) return
    setChoices(prev => [...prev, { id: LETTER_IDS[prev.length], label: '', description: '', name: '' }])
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
    if (choices.some(c => c.name && !CHOICE_NAME_RE.test(c.name))) {
      setError('Choice names must start with a letter and contain only letters, numbers, and underscores.')
      return
    }
    setSaving(true)
    setError('')
    const choicesMap = Object.fromEntries(choices.map(c => [
      c.id,
      { label: c.label, description: c.description, ...(c.name ? { name: c.name } : {}) },
    ]))
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
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">New Episode</p>
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Episode label" className={smallInputClass} />
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
            <div className="pl-5 space-y-1">
              <input value={c.description} onChange={e => updateChoice(i, 'description', e.target.value)} placeholder="Description (optional)" className={smallInputClass} />
              <input
                value={c.name}
                onChange={e => updateChoice(i, 'name', e.target.value)}
                placeholder="Story name, e.g. HonorAutonomy (optional)"
                className={`${smallInputClass} font-mono`}
              />
              {c.name && !CHOICE_NAME_RE.test(c.name) && (
                <p className="text-[10px] text-red-500">Letters, numbers, underscores only — must start with a letter.</p>
              )}
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
        <button type="submit" disabled={saving} className={smallBtnClass}>{saving ? 'Creating…' : 'Create Episode'}</button>
        <button type="button" onClick={onCancel} className="text-[11px] text-zinc-400 hover:text-zinc-600">Cancel</button>
      </div>
    </form>
  )
}

// ─── Library ─────────────────────────────────────────────────────────────────

function normalizeIpfsUri(input: string): string {
  const m = input.match(/\/ipfs\/(.+)/)
  if (m) return `ipfs://${m[1].trim()}`
  return input.trim()
}

function ipfsToGateway(uri: string) {
  if (uri.startsWith('ipfs://')) {
    const cid = uri.slice('ipfs://'.length)
    return `/api/admin/ipfs-image?cid=${encodeURIComponent(cid)}`
  }
  return uri
}

function ImageSlot({
  choicePoint,
  type,
  uri,
  imageKey,
  onRefresh,
}: {
  choicePoint: string
  type: 'winner' | 'participation'
  uri?: string
  imageKey?: string
  onRefresh: () => void
}) {
  const key = `${choicePoint}:${type}`
  const [uploading, setUploading] = useState(false)
  const [manualUri, setManualUri] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setUploading(true)
    setStatus('')
    const form = new FormData()
    form.append('file', file)
    form.append('choice_point', choicePoint)
    form.append('type', type)
    try {
      const res = await fetch('/api/admin/upload-nft-image', { method: 'POST', body: form })
      const data = await res.json()
      if (res.ok) { setStatus(`Pinned: ${data.metadataCid ?? data.cid ?? 'ok'}`); onRefresh() }
      else setStatus(`Error: ${data.error}`)
    } catch { setStatus('Error: Upload failed.') }
    setUploading(false)
  }

  async function saveUri() {
    if (!manualUri.trim()) return
    setSaving(true)
    setStatus('')
    const field = type === 'winner' ? 'winner_nft_uri' : 'participation_nft_uri'
    const normalized = normalizeIpfsUri(manualUri)
    try {
      const res = await fetch('/api/admin/chapter-data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice_point: choicePoint, [field]: normalized }),
      })
      if (res.ok) { setStatus('Saved.'); setManualUri(''); onRefresh() }
      else { const d = await res.json(); setStatus(`Error: ${d.error}`) }
    } catch { setStatus('Error: Save failed.') }
    setSaving(false)
  }

  const label = type === 'winner' ? 'Winner NFT' : 'Participation NFT'

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</p>

      {uri ? (
        <div className="space-y-1.5">
          <div className="aspect-[9/16] w-full overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageKey ? `/api/nft-image?key=${encodeURIComponent(imageKey)}` : ipfsToGateway(uri)}
              alt={label}
              className="h-full w-full object-cover"
              onError={e => {
                if (imageKey) return
                const img = e.currentTarget
                const cid = uri.replace('ipfs://', '')
                const fallbacks = [
                  `/api/admin/ipfs-image?cid=${encodeURIComponent(cid)}`,
                  `https://teal-manual-junglefowl-646.mypinata.cloud/ipfs/${cid}`,
                  `https://ipfs.io/ipfs/${cid}`,
                ]
                const tried = parseInt(img.dataset.tried ?? '0')
                if (tried < fallbacks.length) {
                  img.dataset.tried = String(tried + 1)
                  img.src = fallbacks[tried]
                }
              }}
            />
          </div>
          <a href={ipfsToGateway(uri)} target="_blank" rel="noopener noreferrer"
            className="break-all font-mono text-[10px] text-zinc-400 hover:text-zinc-600 underline">
            {uri}
          </a>
        </div>
      ) : (
        <div className="flex aspect-[9/16] w-full items-center justify-center rounded border-2 border-dashed border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs text-zinc-400">No image</p>
        </div>
      )}

      <div className="flex gap-2">
        <label className={`${smallBtnClass} cursor-pointer`}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }}
            key={key}
          />
          {uploading ? 'Uploading…' : 'Upload'}
        </label>
      </div>

      <div className="flex gap-1">
        <input
          value={manualUri}
          onChange={e => setManualUri(e.target.value)}
          placeholder="ipfs://… or gateway URL"
          className={`${smallInputClass} flex-1 font-mono`}
        />
        <button onClick={saveUri} disabled={saving || !manualUri.trim()} className={smallBtnClass}>
          {saving ? '…' : 'Set'}
        </button>
      </div>

      {status && (
        <p className={`text-[11px] ${status.startsWith('Error') ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {status}
        </p>
      )}
    </div>
  )
}

function LibrarySection() {
  const [chapters, setChapters] = useState<LibraryChapter[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/nft-library')
    if (res.ok) { setChapters(await res.json()); setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Group by universe
  const byUniverse = chapters.reduce<Record<string, LibraryChapter[]>>((acc, ch) => {
    if (!acc[ch.universe]) acc[ch.universe] = []
    acc[ch.universe].push(ch)
    return acc
  }, {})

  if (loading) return <p className="text-sm text-zinc-400">Loading…</p>
  if (chapters.length === 0) return <p className="text-sm text-zinc-400">No episodes yet.</p>

  return (
    <div className="space-y-8">
      {Object.entries(byUniverse).sort(([a], [b]) => a.localeCompare(b)).map(([universeId, chs]) => (
        <div key={universeId}>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-400">{universeId}</p>
          <div className="space-y-4">
            {chs.map(ch => (
              <div key={ch.choice_point} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
                <div className="mb-3">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{ch.chapter_label || ch.choice_point}</p>
                  <p className="font-mono text-[10px] text-zinc-400">{ch.choice_point}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <ImageSlot choicePoint={ch.choice_point} type="winner" uri={ch.winner_nft_uri} imageKey={ch.winner_image_key} onRefresh={load} />
                  <ImageSlot choicePoint={ch.choice_point} type="participation" uri={ch.participation_nft_uri} imageKey={ch.participation_image_key} onRefresh={load} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Behavioral weight grid ───────────────────────────────────────────────────

function BehavioralWeightGrid({
  weights,
  onChange,
}: {
  weights: BehavioralWeights
  onChange: (next: BehavioralWeights) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const nonZero = BEHAVIORAL_TRAITS.filter(t => (weights[t] ?? 0) !== 0)

  return (
    <div className="mt-2">
      {/* Badge summary — always visible when weights are set */}
      {nonZero.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {nonZero.map(trait => {
            const val = weights[trait]!
            return (
              <span
                key={trait}
                className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                  val > 0
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                    : 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400'
                }`}
              >
                {trait} {val > 0 ? `+${val}` : val}
              </span>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        {expanded ? 'Hide weights ▲' : nonZero.length === 0 ? 'Set behavioral weights ▼' : 'Edit weights ▼'}
      </button>

      {expanded && (
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5">
          {BEHAVIORAL_TRAITS.map(trait => {
            const val = weights[trait] ?? 0
            return (
              <div key={trait} className="flex items-center gap-2">
                <span className={`flex-1 truncate text-[11px] ${val !== 0 ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 dark:text-zinc-600'}`}>
                  {trait}
                </span>
                <input
                  type="number"
                  min={-5}
                  max={5}
                  value={val}
                  onChange={e => {
                    const n = parseInt(e.target.value) || 0
                    const next = { ...weights }
                    if (n === 0) delete next[trait]
                    else next[trait] = n
                    onChange(next)
                  }}
                  className={`w-14 rounded border px-1 py-0.5 text-center text-xs focus:outline-none
                    ${val !== 0
                      ? 'border-zinc-400 bg-white text-zinc-900 dark:border-zinc-500 dark:bg-zinc-700 dark:text-zinc-100'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-600'
                    }`}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Universe nav ─────────────────────────────────────────────────────────────

function UniverseNav({
  activeChoicePoint,
  editingChoicePoint,
  onActivate,
  onEdit,
}: {
  activeChoicePoint: string | undefined
  editingChoicePoint: string | null
  onActivate: () => void
  onEdit: (choicePoint: string) => void
}) {
  const [universes, setUniverses] = useState<UniverseItem[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showNewUniverse, setShowNewUniverse] = useState(false)
  const [newUniverseForm, setNewUniverseForm] = useState({ id: '', title: '' })
  const [creatingUniverse, setCreatingUniverse] = useState(false)
  const [universeError, setUniverseError] = useState('')
  const [newEpisodeFor, setNewChapterFor] = useState<string | null>(null)
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
    loadUniverses()
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
                  <p className="py-1 text-[11px] text-zinc-400">No episodes yet.</p>
                )}
                {u.chapters.map(ch => {
                  const isActive = ch.choice_point === activeChoicePoint
                  const isEditing = ch.choice_point === editingChoicePoint
                  return (
                    <div key={ch.choice_point} className={`rounded px-2 py-1.5 ${isActive ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                            {ch.chapter_label || ch.choice_point}
                          </p>
                          <p className="font-mono text-[10px] text-zinc-400">{ch.choice_point}</p>
                        </div>
                        <StatusBadge status={ch.status} />
                      </div>
                      <div className="mt-1 flex gap-2">
                        {isActive ? (
                          <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">live</span>
                        ) : (
                          <button
                            onClick={() => activate(ch.choice_point)}
                            disabled={activating === ch.choice_point}
                            className="rounded bg-zinc-200 px-2 py-0.5 text-[10px] text-zinc-700 hover:bg-zinc-300 disabled:opacity-40 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                          >
                            {activating === ch.choice_point ? '…' : 'Make live'}
                          </button>
                        )}
                        {isEditing ? (
                          <span className="text-[10px] font-medium text-indigo-600 dark:text-indigo-400">editing</span>
                        ) : (
                          <button
                            onClick={() => onEdit(ch.choice_point)}
                            className="rounded bg-zinc-200 px-2 py-0.5 text-[10px] text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
                          >
                            Edit content
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {newEpisodeFor === u.universe_id ? (
                  <NewEpisodeForm
                    universeId={u.universe_id}
                    onCreated={async () => { setNewChapterFor(null); await loadUniverses() }}
                    onCancel={() => setNewChapterFor(null)}
                  />
                ) : (
                  <button
                    onClick={() => setNewChapterFor(u.universe_id)}
                    className="mt-1 text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    + New episode
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

  const [editingEpisodeLabel, setEditingChapterLabel] = useState('')
  const [savingEpisodeLabel, setSavingChapterLabel] = useState(false)
  const [episodeLabelStatus, setChapterLabelStatus] = useState('')
  const [editingAuthorLinkUrl, setEditingAuthorLinkUrl] = useState('')
  const [editingAuthorLinkLabel, setEditingAuthorLinkLabel] = useState('')
  const [savingAuthorLink, setSavingAuthorLink] = useState(false)
  const [authorLinkStatus, setAuthorLinkStatus] = useState('')
  const [editingPrompt, setEditingPrompt] = useState('')
  const [savingPrompt, setSavingPrompt] = useState(false)
  const [promptStatus, setPromptStatus] = useState('')
  const [editingChoices, setEditingChoices] = useState<Record<string, Choice>>({})
  const [savingChoices, setSavingChoices] = useState(false)
  const [choicesEditStatus, setChoicesEditStatus] = useState('')

  const [uploadingStory, setUploadingStory] = useState(false)
  const [uploadingChoiceIntro, setUploadingChoiceIntro] = useState(false)
  const [uploadingChoices, setUploadingChoices] = useState<Record<string, boolean>>({})
  const [uploadingEpilogue, setUploadingEpilogue] = useState(false)
  const [announcing, setAnnouncing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resettingGame, setResettingGame] = useState(false)
  const [resetGameStatus, setResetGameStatus] = useState('')
  const [timerMinutes, setTimerMinutes] = useState(5)
  const [settingTimer, setSettingTimer] = useState(false)
  const [timerStatus, setTimerStatus] = useState('')
  const [closingEpisode, setClosingChapter] = useState(false)
  const [closeStatus, setCloseStatus] = useState('')
  const [mintingNFTs, setMintingNFTs] = useState(false)
  const [mintStatus, setMintStatus] = useState('')
  const [creatingOffers, setCreatingOffers] = useState(false)
  const [offerStatus, setOfferStatus] = useState('')
  const [advancing, setAdvancing] = useState(false)
  const [advanceStatus, setAdvanceStatus] = useState('')
  const [mintPollStatus, setMintPollStatus] = useState('')
  const [expectedMints, setExpectedMints] = useState<{ total: number; voters: number; winner_tier: number } | null>(null)

  const [editingChoicePoint, setEditingChoicePoint] = useState<string | null>(null)
  const [editingChapterData, setEditingChapterData] = useState<ChapterData | null>(null)
  const [contentTab, setContentTab] = useState<'content' | 'library'>('content')
  const [behavioralProfile, setBehavioralProfile] = useState<Record<string, number> | null>(null)

  const [testMode, setTestModeState] = useState(false)
  const [testModeLoading, setTestModeLoading] = useState(false)

  useEffect(() => {
    fetch('/api/admin/test-mode')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTestModeState(Boolean(data.test_mode)) })
      .catch(() => {})
  }, [])

  async function toggleTestMode() {
    const next = !testMode
    setTestModeLoading(true)
    try {
      const res = await fetch('/api/admin/test-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (res.ok) setTestModeState(next)
    } catch { /* leave state unchanged on failure */ }
    setTestModeLoading(false)
  }

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
        setEditingChoicePoint(prev => prev ?? data.choice_point)
        // Load current minting status on page open
        const cp = encodeURIComponent(data.choice_point)
        const [mintRes, expectedRes] = await Promise.all([
          fetch(`/api/admin/mint-status?choice_point=${cp}`),
          data.status === 'closed' ? fetch(`/api/admin/mint-expected?choice_point=${cp}`) : Promise.resolve(null),
        ])
        if (mintRes.ok) {
          const s = await mintRes.json() as { total: number; minted: number; offered: number }
          if (s.total > 0) setMintPollStatus(`${s.total} total — ${s.minted} awaiting offer, ${s.offered} offered`)
        }
        if (expectedRes?.ok) {
          const e = await expectedRes.json() as { expected_mints: number; unique_voters: number; winner_tier: number }
          setExpectedMints({ total: e.expected_mints, voters: e.unique_voters, winner_tier: e.winner_tier })
        }
      } else {
        setLoadError('No active chapter found.')
      }
      if (tallyRes.ok) setTally(await tallyRes.json())

      const profileRes = await fetch('/api/admin/behavioral-profile')
      if (profileRes.ok) setBehavioralProfile(await profileRes.json())
    } catch {
      setLoadError('Failed to load chapter data.')
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // When editing context changes, reload chapter data + S3 content
  useEffect(() => {
    if (!editingChoicePoint) return

    setStoryContent('')
    setChoiceIntroContent('')
    setChoiceContents({})
    setEpilogueContent('')

    const cp = encodeURIComponent(editingChoicePoint)
    Promise.all([
      fetch(`/api/admin/chapter-data?choice_point=${cp}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/admin/chapter-content?choice_point=${cp}`).then(r => r.ok ? r.json() : null),
    ]).then(([chData, content]) => {
      if (chData) {
        setEditingChapterData(chData)
        setEditingChapterLabel(chData.chapter_label ?? '')
        setEditingAuthorLinkUrl(chData.author_link_url ?? 'https://sjmorriswrites.com')
        setEditingAuthorLinkLabel(chData.author_link_label ?? 'sjmorriswrites')
        setEditingPrompt(chData.prompt ?? '')
        setEditingChoices(chData.choices ?? {})
        setChoicesEditStatus('')
        setChapterLabelStatus('')
        setPromptStatus('')
      }
      if (content) {
        if (content.story_text) setStoryContent(content.story_text)
        if (content.choice_intro_text) setChoiceIntroContent(content.choice_intro_text)
        if (content.epilogue_text) setEpilogueContent(content.epilogue_text)
        if (content.choice_outcome_texts) setChoiceContents(content.choice_outcome_texts)
      }
    }).catch(() => {/* non-fatal */})
  }, [editingChoicePoint])

  async function signOut() {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    router.push('/admin/login')
  }

  async function uploadContent(
    type: 'story' | 'choice_intro' | 'choice_outcome' | 'epilogue',
    choice_id?: string
  ) {
    if (!editingChapterData) return
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
    if (!editingChoicePoint) { setStatus('Error: No editing context set.'); return }

    setUploading(true)
    setStatus('')
    try {
      const res = await fetch('/api/admin/upload-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice_point: editingChoicePoint, type, content, choice_id }),
      })
      const data = await res.json()
      if (res.ok) { setStatus(`Uploaded → ${data.s3_key}`); await loadData() }
      else setStatus(`Error: ${data.error}`)
    } catch {
      setStatus('Error: Upload failed.')
    }
    setUploading(false)
  }

  async function saveEpisodeLabel() {
    if (!editingChoicePoint) return
    setSavingChapterLabel(true)
    setChapterLabelStatus('')
    try {
      const res = await fetch('/api/admin/chapter-data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice_point: editingChoicePoint, chapter_label: editingEpisodeLabel }),
      })
      if (res.ok) {
        setChapterLabelStatus('Saved.')
        setEditingChapterData(prev => prev ? { ...prev, chapter_label: editingEpisodeLabel } : prev)
      } else {
        const data = await res.json()
        setChapterLabelStatus(`Error: ${data.error}`)
      }
    } catch {
      setChapterLabelStatus('Error: Request failed.')
    }
    setSavingChapterLabel(false)
  }

  async function saveAuthorLink() {
    if (!editingChoicePoint) return
    setSavingAuthorLink(true)
    setAuthorLinkStatus('')
    try {
      const res = await fetch('/api/admin/chapter-data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice_point: editingChoicePoint, author_link_url: editingAuthorLinkUrl, author_link_label: editingAuthorLinkLabel }),
      })
      if (res.ok) {
        setAuthorLinkStatus('Saved.')
        setEditingChapterData(prev => prev ? { ...prev, author_link_url: editingAuthorLinkUrl, author_link_label: editingAuthorLinkLabel } : prev)
      } else {
        const data = await res.json()
        setAuthorLinkStatus(`Error: ${data.error}`)
      }
    } catch {
      setAuthorLinkStatus('Error: Request failed.')
    }
    setSavingAuthorLink(false)
  }

  async function savePrompt() {
    if (!editingChoicePoint) return
    setSavingPrompt(true)
    setPromptStatus('')
    try {
      const res = await fetch('/api/admin/chapter-data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice_point: editingChoicePoint, prompt: editingPrompt }),
      })
      if (res.ok) {
        setPromptStatus('Saved.')
        setEditingChapterData(prev => prev ? { ...prev, prompt: editingPrompt } : prev)
      } else {
        const data = await res.json()
        setPromptStatus(`Error: ${data.error}`)
      }
    } catch {
      setPromptStatus('Error: Request failed.')
    }
    setSavingPrompt(false)
  }

  async function saveChoices() {
    if (!editingChoicePoint) return
    if (Object.values(editingChoices).some(c => c.name && !CHOICE_NAME_RE.test(c.name))) {
      setChoicesEditStatus('Error: fix invalid story names before saving.')
      return
    }
    setSavingChoices(true)
    setChoicesEditStatus('')
    try {
      const cleaned = Object.fromEntries(
        Object.entries(editingChoices).map(([id, c]) => [id, c.name ? c : { ...c, name: undefined }])
      )
      const res = await fetch('/api/admin/chapter-data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice_point: editingChoicePoint, choices: cleaned }),
      })
      if (res.ok) {
        setChoicesEditStatus('Saved.')
        setEditingChapterData(prev => prev ? { ...prev, choices: editingChoices } : prev)
      } else {
        const data = await res.json()
        setChoicesEditStatus(`Error: ${data.error}`)
      }
    } catch {
      setChoicesEditStatus('Error: Request failed.')
    }
    setSavingChoices(false)
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

  async function closeEpisode(force = false) {
    setClosingChapter(true)
    setCloseStatus('')
    try {
      const res = await fetch('/api/admin/close-chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      })
      const data = await res.json()
      if (res.ok) {
        if (data.skipped === 'Deadline not yet reached') {
          setClosingChapter(false)
          const closes = data.closes_at ? new Date(data.closes_at).toLocaleTimeString() : 'unknown'
          if (confirm(`Deadline not yet reached (closes at ${closes}). Force close anyway?`)) {
            closeEpisode(true)
          } else {
            setCloseStatus('Cancelled.')
          }
          return
        }
        if (data.skipped) setCloseStatus(`Skipped: ${data.skipped}`)
        else setCloseStatus(`Closed. Winner: ${data.winning_choice ?? 'none'} (yield ${((data.yield_pct ?? 0) * 100).toFixed(0)}%)`)
        await loadData()
      } else {
        setCloseStatus(`Error: ${data.error}`)
      }
    } catch { setCloseStatus('Error: Request failed.') }
    setClosingChapter(false)
  }

  function startMintPolling(choicePoint: string, expected?: number) {
    setMintPollStatus('Waiting for Lambda…')
    let prev = { total: 0, minted: 0, offered: 0 }
    let stableCount = 0
    const deadline = Date.now() + 5 * 60 * 1000 // 5-minute hard stop

    function formatStatus(s: { total: number; minted: number; offered: number }) {
      const ofStr = expected != null ? `${s.total} of ${expected}` : `${s.total} total`
      return `${ofStr} minted — ${s.minted} awaiting offer, ${s.offered} offered`
    }

    const id = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(id)
        setMintPollStatus(prev => prev === 'Waiting for Lambda…' ? 'Timed out — check Lambda logs.' : prev)
        return
      }
      try {
        const res = await fetch(`/api/admin/mint-status?choice_point=${encodeURIComponent(choicePoint)}`)
        if (!res.ok) return
        const s = await res.json() as { total: number; minted: number; offered: number }
        if (s.total > 0) {
          setMintPollStatus(formatStatus(s))
        }
        // Lambda mints sequentially; each XRPL tx takes 4-6s. Stop only after 20 stable polls (~80s).
        if (s.total > 0 && s.total === prev.total && s.minted === prev.minted && s.offered === prev.offered) {
          stableCount++
          if (stableCount >= 20) clearInterval(id)
        } else {
          stableCount = 0
        }
        prev = s
      } catch {}
    }, 4000)
    return id
  }

  async function mintNFTs() {
    if (!chapter) return
    if (chapter.status !== 'closed') { setMintStatus('Error: Chapter must be closed first.'); return }
    if (!confirm(`Mint NFTs for "${chapter.chapter_label}"? This will invoke the Lambda and cannot be undone.`)) return
    setMintingNFTs(true)
    setMintStatus('')
    setOfferStatus('')
    setMintPollStatus('')
    try {
      const res = await fetch('/api/admin/mint-nfts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice_point: chapter.choice_point }),
      })
      const data = await res.json()
      if (res.ok) {
        setMintStatus('Step 1 started.')
        startMintPolling(chapter.choice_point, expectedMints?.total)
      } else setMintStatus(`Error: ${data.error}`)
    } catch { setMintStatus('Error: Request failed.') }
    setMintingNFTs(false)
  }

  async function createOffers() {
    if (!chapter) return
    if (!confirm(`Create sell offers for minted NFTs in "${chapter.chapter_label}"?`)) return
    setCreatingOffers(true)
    setMintStatus('')
    setOfferStatus('')
    setMintPollStatus('')
    try {
      const res = await fetch('/api/admin/create-offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice_point: chapter.choice_point }),
      })
      const data = await res.json()
      if (res.ok) {
        setOfferStatus('Step 2 started.')
        startMintPolling(chapter.choice_point, expectedMints?.total)
      } else setOfferStatus(`Error: ${data.error}`)
    } catch { setOfferStatus('Error: Request failed.') }
    setCreatingOffers(false)
  }

  async function resetEpisode() {
    if (!confirm(`Reset episode? This increments reset_version and reopens voting for ${resetHours}h.`)) return
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

  async function resetFullGame() {
    if (!confirm('Reset the entire game? This will:\n• Increment reset_version (old votes and NFT taxons are retired)\n• Clear all tally caches\n• Remove the active episode (site goes dormant until you make an episode live)\n\nThis cannot be undone.')) return
    setResettingGame(true)
    setResetGameStatus('')
    setCloseStatus('')
    try {
      const res = await fetch('/api/admin/reset-game', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setResetGameStatus(`Game reset. New rv=${data.reset_version}. Winner taxon ${data.winner_taxon}, participation ${data.participation_taxon}. Make an episode live to restart.`)
        await loadData()
      } else setResetGameStatus(`Error: ${data.error}`)
    } catch { setResetGameStatus('Error: Request failed.') }
    setResettingGame(false)
  }

  async function advanceEpisode() {
    if (!confirm('Advance to the next episode? This activates it, sets a fresh 24h voting deadline, announces on Discord, and schedules the observer bots. Do this after NFTs are distributed.')) return
    setAdvancing(true)
    setAdvanceStatus('')
    try {
      const res = await fetch('/api/admin/advance', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setAdvanceStatus(`Advanced to ${data.active_choice_point} — announced, voting closes ${new Date(data.voting_closes_at).toLocaleString()}.`)
        await loadData()
      } else setAdvanceStatus(`Error: ${data.error}`)
    } catch { setAdvanceStatus('Error: Request failed.') }
    setAdvancing(false)
  }

  async function setTimer(isoString: string) {
    if (!chapter) return
    setSettingTimer(true)
    setTimerStatus('')
    try {
      const res = await fetch('/api/admin/chapter-data', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice_point: chapter.choice_point, voting_closes_at: isoString }),
      })
      if (res.ok) {
        const label = new Date(isoString) <= new Date()
          ? 'Timer expired.'
          : `Deadline set to ${new Date(isoString).toLocaleTimeString()}.`
        setTimerStatus(label)
        await loadData()
      } else {
        const data = await res.json()
        setTimerStatus(`Error: ${data.error}`)
      }
    } catch { setTimerStatus('Error: Request failed.') }
    setSettingTimer(false)
  }

  const total = tally ? Object.values(tally.counts).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 px-4 py-8 dark:bg-black sm:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-medium uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Admin</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTestMode}
              disabled={testModeLoading}
              title="Speeds up observer bot reactions (minutes instead of hours) and shows the public reset-warning banner."
              className={`rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide disabled:opacity-40 ${
                testMode
                  ? 'bg-amber-500 text-amber-950 hover:bg-amber-400 dark:bg-amber-600 dark:text-amber-50 dark:hover:bg-amber-500'
                  : 'bg-zinc-200 text-zinc-500 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
              }`}
            >
              {testModeLoading ? '…' : `Test Mode: ${testMode ? 'ON' : 'OFF'}`}
            </button>
            <button onClick={signOut} className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400">
              Sign out
            </button>
          </div>
        </div>

        {/* Two-column grid */}
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">

          {/* Left: Universe nav */}
          <div className="lg:self-start">
            <UniverseNav
              activeChoicePoint={chapter?.choice_point}
              editingChoicePoint={editingChoicePoint}
              onActivate={loadData}
              onEdit={setEditingChoicePoint}
            />
          </div>

          {/* Right: chapter + content + actions */}
          <div className="space-y-6">

            {/* Active chapter */}
            <Section title="Active Episode">
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
                  <div className="space-y-1.5">
                    <textarea
                      value={editingPrompt}
                      onChange={e => setEditingPrompt(e.target.value)}
                      rows={3}
                      className={smallInputClass}
                    />
                    <div className="flex items-center gap-3">
                      <button onClick={savePrompt} disabled={savingPrompt} className={smallBtnClass}>
                        {savingPrompt ? 'Saving…' : 'Save Prompt'}
                      </button>
                      {promptStatus && <span className="text-[11px] text-zinc-400">{promptStatus}</span>}
                    </div>
                  </div>
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

            {/* Content / Library tabs */}
            <div className="rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              {/* Tab bar */}
              <div className="flex items-center gap-1 border-b border-zinc-200 px-6 pt-4 dark:border-zinc-800">
                <button
                  onClick={() => setContentTab('content')}
                  className={`rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${
                    contentTab === 'content'
                      ? 'border-b-2 border-zinc-800 text-zinc-900 dark:border-zinc-200 dark:text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                  }`}
                >
                  {editingChoicePoint && editingChoicePoint !== chapter?.choice_point
                    ? `Content — ${editingChoicePoint}`
                    : 'Content'}
                </button>
                <button
                  onClick={() => setContentTab('library')}
                  className={`rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${
                    contentTab === 'library'
                      ? 'border-b-2 border-zinc-800 text-zinc-900 dark:border-zinc-200 dark:text-zinc-100'
                      : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                  }`}
                >
                  Library
                </button>
              </div>
              <div className="p-6">
              {contentTab === 'library' ? (
                <LibrarySection />
              ) : (
              <div className="space-y-6">
                {editingChapterData && (
                  <div>
                    <label className="mb-1.5 block text-xs text-zinc-500">Episode label</label>
                    <div className="flex gap-2">
                      <input
                        value={editingEpisodeLabel}
                        onChange={e => setEditingChapterLabel(e.target.value)}
                        placeholder="e.g. The Laboratory"
                        className={`${inputClass} flex-1`}
                      />
                      <button onClick={saveEpisodeLabel} disabled={savingEpisodeLabel} className={btnClass}>
                        {savingEpisodeLabel ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                    <ActionStatus message={episodeLabelStatus} />
                  </div>
                )}
                {editingChapterData && (
                  <div>
                    <label className="mb-1.5 block text-xs text-zinc-500">Author link</label>
                    <div className="flex flex-col gap-2">
                      <input
                        value={editingAuthorLinkUrl}
                        onChange={e => setEditingAuthorLinkUrl(e.target.value)}
                        placeholder="https://sjmorriswrites.com"
                        className={inputClass}
                      />
                      <div className="flex gap-2">
                        <input
                          value={editingAuthorLinkLabel}
                          onChange={e => setEditingAuthorLinkLabel(e.target.value)}
                          placeholder="Label (optional — defaults to hostname)"
                          className={`${inputClass} flex-1`}
                        />
                        <button onClick={saveAuthorLink} disabled={savingAuthorLink} className={btnClass}>
                          {savingAuthorLink ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                    </div>
                    <ActionStatus message={authorLinkStatus} />
                  </div>
                )}
                <div>
                  <label className="mb-1.5 block text-xs text-zinc-500">
                    Pre-choice story{editingChapterData?.story_key ? ` — ${editingChapterData.story_key}` : ' — not uploaded'}
                  </label>
                  <textarea value={storyContent} onChange={e => setStoryContent(e.target.value)}
                    placeholder="Shown to readers while voting is open…" rows={6} className={monoInputClass} />
                  <button onClick={() => uploadContent('story')} disabled={uploadingStory || !editingChapterData} className={`mt-2 ${btnClass}`}>
                    {uploadingStory ? 'Uploading…' : 'Upload Story'}
                  </button>
                  <ActionStatus message={storyStatus} />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs text-zinc-500">
                    Choice intro{editingChapterData?.choice_intro_key ? ` — ${editingChapterData.choice_intro_key}` : ' — not uploaded'}
                  </label>
                  <p className="mb-2 text-xs text-zinc-400 dark:text-zinc-600">
                    Narrative bridge before the voting options. Choice labels and descriptions render automatically below it.
                  </p>
                  <textarea value={choiceIntroContent} onChange={e => setChoiceIntroContent(e.target.value)}
                    placeholder="Evelyn has only one chance…" rows={4} className={monoInputClass} />
                  <button onClick={() => uploadContent('choice_intro')} disabled={uploadingChoiceIntro || !editingChapterData} className={`mt-2 ${btnClass}`}>
                    {uploadingChoiceIntro ? 'Uploading…' : 'Upload Choice Intro'}
                  </button>
                  <ActionStatus message={choiceIntroStatus} />
                </div>

                {/* Prompt — admin/Discord only, never shown to players */}
                {editingChapterData && (
                  <div>
                    <label className="mb-1.5 block text-xs text-zinc-500">
                      Prompt <span className="text-zinc-400 dark:text-zinc-600">(Discord &amp; admin only — not shown to players)</span>
                    </label>
                    <textarea
                      value={editingPrompt}
                      onChange={e => setEditingPrompt(e.target.value)}
                      rows={2}
                      className={monoInputClass}
                    />
                    <button onClick={savePrompt} disabled={savingPrompt} className={`mt-2 ${btnClass}`}>
                      {savingPrompt ? 'Saving…' : 'Save Prompt'}
                    </button>
                    <ActionStatus message={promptStatus} />
                  </div>
                )}

                {/* Editable choice labels and descriptions */}
                {editingChapterData && (
                  <div>
                    <label className="mb-1.5 block text-xs text-zinc-500">Choice labels &amp; descriptions</label>
                    <div className="space-y-3">
                      {Object.entries(editingChoices).map(([id, c]) => (
                        <div key={id} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="w-4 text-center text-[10px] font-bold text-zinc-400">{id}</span>
                            <input
                              value={c.label}
                              onChange={e => setEditingChoices(prev => ({ ...prev, [id]: { ...prev[id], label: e.target.value } }))}
                              placeholder="Label"
                              className={`${smallInputClass} flex-1`}
                            />
                          </div>
                          <div className="pl-6 space-y-1">
                            <input
                              value={c.description}
                              onChange={e => setEditingChoices(prev => ({ ...prev, [id]: { ...prev[id], description: e.target.value } }))}
                              placeholder="Description (shown on button)"
                              className={smallInputClass}
                            />
                            <input
                              value={c.name ?? ''}
                              onChange={e => setEditingChoices(prev => ({ ...prev, [id]: { ...prev[id], name: e.target.value } }))}
                              placeholder="Story name, e.g. HonorAutonomy (optional — used by <!--IF U03:E01:C=='Name'-->)"
                              className={`${smallInputClass} font-mono`}
                            />
                            {c.name && !CHOICE_NAME_RE.test(c.name) && (
                              <p className="text-[10px] text-red-500">Letters, numbers, underscores only — must start with a letter.</p>
                            )}
                            <BehavioralWeightGrid
                              weights={c.behavioral_weights ?? {}}
                              onChange={w => setEditingChoices(prev => ({ ...prev, [id]: { ...prev[id], behavioral_weights: w } }))}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <button onClick={saveChoices} disabled={savingChoices} className={`mt-2 ${btnClass}`}>
                      {savingChoices ? 'Saving…' : 'Save Choices'}
                    </button>
                    <ActionStatus message={choicesEditStatus} />
                  </div>
                )}

                {editingChapterData && Object.entries(editingChapterData.choices ?? {}).map(([id, c]) => {
                  const existingKey = editingChapterData.choice_outcomes?.[id]
                  return (
                    <div key={id}>
                      <label className="mb-1.5 block text-xs text-zinc-500">
                        Outcome if <span className="font-semibold text-zinc-700 dark:text-zinc-300">{id} — {c.label}</span>
                        {existingKey ? ` — ${existingKey}` : ' — not uploaded'}
                      </label>
                      <textarea value={choiceContents[id] ?? ''} onChange={e => setChoiceContents(s => ({ ...s, [id]: e.target.value }))}
                        placeholder={`What happens if the community chose "${c.label}"…`} rows={6} className={monoInputClass} />
                      <button onClick={() => uploadContent('choice_outcome', id)} disabled={uploadingChoices[id] || !editingChapterData} className={`mt-2 ${btnClass}`}>
                        {uploadingChoices[id] ? 'Uploading…' : `Upload Outcome ${id}`}
                      </button>
                      <ActionStatus message={choiceStatuses[id]} />
                    </div>
                  )
                })}

                <div>
                  <label className="mb-1.5 block text-xs text-zinc-500">
                    Epilogue{editingChapterData?.epilogue_key ? ` — ${editingChapterData.epilogue_key}` : ' — not uploaded'}
                  </label>
                  <textarea value={epilogueContent} onChange={e => setEpilogueContent(e.target.value)}
                    placeholder="Closing beats shown after the outcome, regardless of choice…" rows={6} className={monoInputClass} />
                  <button onClick={() => uploadContent('epilogue')} disabled={uploadingEpilogue || !editingChapterData} className={`mt-2 ${btnClass}`}>
                    {uploadingEpilogue ? 'Uploading…' : 'Upload Epilogue'}
                  </button>
                  <ActionStatus message={epilogueStatus} />
                </div>
              </div>
              )}
            </div>
          </div>

            {/* Actions */}
            <Section title="Actions">
              <div className="space-y-6">
                <div>
                  <p className="mb-2 text-xs text-zinc-500">Post episode announcement to Discord with current prompt and choices.</p>
                  <button onClick={announce} disabled={announcing || !chapter}
                    className="rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500 disabled:opacity-40 dark:bg-indigo-800 dark:hover:bg-indigo-700">
                    {announcing ? 'Announcing…' : 'Announce on Discord'}
                  </button>
                  <ActionStatus message={announceStatus} />
                </div>
                <div>
                  <p className="mb-1.5 text-xs text-zinc-500">
                    Adjust the active episode&apos;s voting deadline. Useful for testing timer behaviour.
                    {chapter?.voting_closes_at && (
                      <span className="ml-1 text-zinc-400">
                        Current: {new Date(chapter.voting_closes_at).toLocaleString()}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {[1, 5, 15, 60].map(m => (
                      <button
                        key={m}
                        onClick={() => setTimer(new Date(Date.now() + m * 60 * 1000).toISOString())}
                        disabled={settingTimer || !chapter}
                        className={smallBtnClass}
                      >
                        +{m < 60 ? `${m}m` : '1h'}
                      </button>
                    ))}
                    <span className="text-zinc-300 dark:text-zinc-600">|</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={timerMinutes}
                        onChange={e => setTimerMinutes(Math.max(1, Number(e.target.value)))}
                        min={1}
                        className="w-14 rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                      />
                      <span className="text-xs text-zinc-400">min</span>
                      <button
                        onClick={() => setTimer(new Date(Date.now() + timerMinutes * 60 * 1000).toISOString())}
                        disabled={settingTimer || !chapter}
                        className={smallBtnClass}
                      >
                        Set
                      </button>
                    </div>
                    <span className="text-zinc-300 dark:text-zinc-600">|</span>
                    <button
                      onClick={() => setTimer(new Date(Date.now() - 1000).toISOString())}
                      disabled={settingTimer || !chapter}
                      className="rounded bg-amber-600 px-2 py-1 text-[11px] text-white hover:bg-amber-500 disabled:opacity-40"
                    >
                      Expire Now
                    </button>
                  </div>
                  <ActionStatus message={timerStatus} />
                </div>
                <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
                  <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Close Episode
                    {chapter && (
                      <span className="ml-2 font-normal text-zinc-400">
                        {chapter.choice_point.split(':').slice(0, 2).join(':')}
                        {chapter.chapter_label && ` · ${chapter.chapter_label}`}
                      </span>
                    )}
                  </p>
                  <p className="mb-3 text-xs text-zinc-500">
                    Tallies on-chain votes, sets the winner, and marks the episode closed. Required before minting.
                  </p>
                  {tally && !tally.closed && (
                    <p className="mb-3 text-xs text-zinc-500">
                      {tally.voter_count ?? 0} observer{(tally.voter_count ?? 0) !== 1 ? 's' : ''}
                      {total !== (tally.voter_count ?? 0) && (
                        <span className="ml-1 text-zinc-400">(weighted total: {total})</span>
                      )}
                    </p>
                  )}
                  <button
                    onClick={() => closeEpisode()}
                    disabled={closingEpisode || !chapter || chapter.status === 'closed'}
                    className="rounded bg-rose-700 px-3 py-1.5 text-xs text-white hover:bg-rose-600 disabled:opacity-40 dark:bg-rose-900 dark:hover:bg-rose-800"
                  >
                    {closingEpisode ? 'Closing…' : chapter?.status === 'closed' ? 'Already Closed' : 'Close Episode Now'}
                  </button>
                  <ActionStatus message={closeStatus} />
                </div>
                <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
                  <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">NFT Distribution</p>
                  <p className="mb-3 text-xs text-zinc-500">
                    Episode must be closed. Step 1 mints NFTs to the vault — wait for the tally
                    below to stabilize before running Step 2. Step 2 creates sell offers and triggers
                    the claim UI; it is safe to run multiple times if the count looks low.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={mintNFTs}
                      disabled={mintingNFTs || !chapter || chapter.status !== 'closed'}
                      className="rounded bg-violet-600 px-3 py-1.5 text-xs text-white hover:bg-violet-500 disabled:opacity-40 dark:bg-violet-800 dark:hover:bg-violet-700"
                    >
                      {mintingNFTs ? 'Starting…' : 'Step 1 — Mint NFTs'}
                    </button>
                    <button
                      onClick={createOffers}
                      disabled={creatingOffers || !chapter}
                      className="rounded bg-violet-800 px-3 py-1.5 text-xs text-white hover:bg-violet-700 disabled:opacity-40 dark:bg-violet-950 dark:hover:bg-violet-900"
                    >
                      {creatingOffers ? 'Starting…' : 'Step 2 — Send Offers'}
                    </button>
                  </div>
                  <ActionStatus message={mintStatus || offerStatus} />
                  {expectedMints && (
                    <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      Expecting {expectedMints.total} mints: {expectedMints.voters} participation
                      {expectedMints.winner_tier > 0 ? ` + ${expectedMints.winner_tier} winner` : ''}
                    </p>
                  )}
                  {mintPollStatus && (
                    <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{mintPollStatus}</p>
                  )}
                </div>
                <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
                  <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">Advance to Next Episode</p>
                  <p className="mb-3 text-xs text-zinc-500">
                    Makes the next chapter in sequence live: activates it, sets a fresh 24h voting
                    deadline, announces on Discord, and schedules the observer bots. The game stays
                    on the closed episode until you do this — distribute NFTs first so weights are
                    settled. (The separate Announce button is only for first episodes, post-reset
                    starts, and re-announcing.)
                  </p>
                  <button
                    onClick={advanceEpisode}
                    disabled={advancing || !chapter || chapter.status !== 'closed'}
                    className="rounded bg-emerald-700 px-3 py-1.5 text-xs text-white hover:bg-emerald-600 disabled:opacity-40 dark:bg-emerald-900 dark:hover:bg-emerald-800"
                  >
                    {advancing ? 'Advancing…' : 'Advance to Next Episode'}
                  </button>
                  <ActionStatus message={advanceStatus} />
                </div>
                <div>
                  <p className="mb-2 text-xs text-zinc-500">
                    Increment reset_version, reopen the current episode, and bust tally cache.
                    Existing blockchain votes are preserved but excluded from tallies and NFT minting.
                  </p>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-zinc-500">Voting hours</label>
                    <input type="number" value={resetHours} onChange={e => setResetHours(Number(e.target.value))} min={1} max={168}
                      className="w-20 rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-500" />
                  </div>
                  <button onClick={resetEpisode} disabled={resetting || !chapter}
                    className="mt-2 rounded bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-500 disabled:opacity-40 dark:bg-red-900 dark:hover:bg-red-800">
                    {resetting ? 'Resetting…' : 'Reset Chapter'}
                  </button>
                  <ActionStatus message={resetStatus} />
                </div>
                <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
                  <p className="mb-2 text-xs text-zinc-500">
                    Full game reset — retires all tally caches, increments reset_version (new NFT taxon generation),
                    and clears the active episode. Use after distributing NFTs at the end of a universe run.
                    Make an episode live afterward to start the next round.
                  </p>
                  <button onClick={resetFullGame} disabled={resettingGame}
                    className="rounded bg-red-800 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-40 dark:bg-red-950 dark:hover:bg-red-900">
                    {resettingGame ? 'Resetting…' : 'Reset Game'}
                  </button>
                  <ActionStatus message={resetGameStatus} />
                </div>
              </div>
            </Section>

<Section title="The Record">
              <p className="mb-4 text-xs text-zinc-400 dark:text-zinc-600">
                Sealed observations. Judging is reveal-driven — you only ever act on entries a player has chosen to reveal, and your verdict is canon.
              </p>
              <AdminRecordJudge />
            </Section>

<Section title="Behavioral Profile">
              <p className="mb-4 text-xs text-zinc-400 dark:text-zinc-600">
                Accumulated observation data across all closed chapters. Updated automatically when a chapter closes.
              </p>
              {!behavioralProfile || Object.keys(behavioralProfile).length === 0 ? (
                <p className="text-xs text-zinc-400">No data yet — profile builds as chapters close.</p>
              ) : (
                <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                  {BEHAVIORAL_TRAITS.map(trait => {
                    const val = behavioralProfile[trait] ?? 0
                    const abs = Math.abs(val)
                    const maxAbs = Math.max(...Object.values(behavioralProfile).map(Math.abs), 1)
                    const pct = Math.round((abs / maxAbs) * 100)
                    return (
                      <div key={trait}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className={val !== 0 ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 dark:text-zinc-600'}>
                            {trait}
                          </span>
                          <span className={`font-mono text-[11px] ${val > 0 ? 'text-emerald-600 dark:text-emerald-400' : val < 0 ? 'text-rose-500 dark:text-rose-400' : 'text-zinc-400'}`}>
                            {val > 0 ? `+${val}` : val}
                          </span>
                        </div>
                        <div className="h-0.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div
                            className={`h-full rounded-full transition-all ${val > 0 ? 'bg-emerald-400 dark:bg-emerald-600' : val < 0 ? 'bg-rose-400 dark:bg-rose-600' : ''}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Section>

          </div>
        </div>
      </div>
    </div>
  )
}
