'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Clue, RevealTrigger } from '@/lib/clues'
import { triggersToCell, cellToTriggers } from '@/lib/clues'

const CATEGORIES: { value: Clue['category']; label: string }[] = [
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'reality', label: 'Reality' },
  { value: 'host', label: 'Host' },
  { value: 'notebook', label: 'Notebook' },
  { value: 'emotional', label: 'Emotional' },
]

const CATEGORY_COLORS: Record<string, string> = {
  behavioral: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  reality:    'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  host:       'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  notebook:   'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  emotional:  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
}

const inputClass = 'w-full rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-600'
const smallInputClass = 'w-full rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-600'
const btnClass = 'rounded bg-zinc-800 px-3 py-1.5 text-xs text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-700 dark:hover:bg-zinc-600'

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${CATEGORY_COLORS[category] ?? ''}`}>
      {category}
    </span>
  )
}

type FilterCategory = Clue['category'] | 'all'
type FilterDiscovered = 'all' | 'discovered' | 'undiscovered'

// ─── Edit form ────────────────────────────────────────────────────────────────

function ClueForm({
  clue,
  onSaved,
  onDeleted,
  onCancel,
}: {
  clue: Clue | null   // null = new clue
  onSaved: (c: Clue) => void
  onDeleted: () => void
  onCancel: () => void
}) {
  const isNew = clue === null
  const [form, setForm] = useState<{
    clue_id: string
    category: Clue['category']
    title: string
    description: string
    is_false_lead: boolean
    prerequisites: string
    reveal_triggers: string
    notes: string
    discovered: boolean
  }>(() => ({
    clue_id: clue?.clue_id ?? '',
    category: clue?.category ?? 'behavioral',
    title: clue?.title ?? '',
    description: clue?.description ?? '',
    is_false_lead: clue?.is_false_lead ?? false,
    prerequisites: (clue?.prerequisites ?? []).join(', '),
    reveal_triggers: triggersToCell(clue?.reveal_triggers ?? []),
    notes: clue?.notes ?? '',
    discovered: clue?.discovered ?? false,
  }))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [status, setStatus] = useState('')

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }))
    setStatus('')
  }

  async function save() {
    setSaving(true)
    setStatus('')
    const prerequisites = form.prerequisites.split(',').map(s => s.trim()).filter(Boolean)
    const reveal_triggers = cellToTriggers(form.reveal_triggers)
    const body: Partial<Clue> = {
      clue_id: form.clue_id.trim().toUpperCase(),
      category: form.category,
      title: form.title.trim(),
      description: form.description.trim(),
      is_false_lead: form.is_false_lead,
      prerequisites,
      reveal_triggers,
      notes: form.notes.trim(),
      discovered: form.discovered,
    }

    const url = isNew ? '/api/admin/clues' : `/api/admin/clues/${clue!.clue_id}`
    const method = isNew ? 'POST' : 'PUT'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      onSaved(await res.json())
    } else {
      const d = await res.json()
      setStatus(`Error: ${d.error}`)
    }
    setSaving(false)
  }

  async function del() {
    if (!clue || !confirm(`Delete clue ${clue.clue_id}? This cannot be undone.`)) return
    setDeleting(true)
    await fetch(`/api/admin/clues/${clue.clue_id}`, { method: 'DELETE' })
    onDeleted()
    setDeleting(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          {isNew ? 'New Clue' : `Edit ${clue!.clue_id}`}
        </h2>
        <button onClick={onCancel} className="text-xs text-zinc-400 hover:text-zinc-600">✕</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-zinc-400">ID</label>
          <input
            value={form.clue_id}
            onChange={e => set('clue_id', e.target.value)}
            placeholder="B1"
            disabled={!isNew}
            className={`${smallInputClass} disabled:opacity-50`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-zinc-400">Category</label>
          <select
            value={form.category}
            onChange={e => set('category', e.target.value as Clue['category'])}
            className={smallInputClass}
          >
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wider text-zinc-400">Title</label>
        <input
          value={form.title}
          onChange={e => set('title', e.target.value)}
          placeholder="The Notebook"
          className={smallInputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wider text-zinc-400">Description</label>
        <textarea
          value={form.description}
          onChange={e => set('description', e.target.value)}
          rows={8}
          placeholder="Markdown supported"
          className={`${inputClass} resize-y font-mono text-xs`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wider text-zinc-400">
          Prerequisites <span className="normal-case text-zinc-500">(comma-separated clue IDs)</span>
        </label>
        <input
          value={form.prerequisites}
          onChange={e => set('prerequisites', e.target.value)}
          placeholder="B1, N2"
          className={smallInputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wider text-zinc-400">
          Reveal triggers <span className="normal-case text-zinc-500">(choice_point/winning_choice, comma-separated)</span>
        </label>
        <input
          value={form.reveal_triggers}
          onChange={e => set('reveal_triggers', e.target.value)}
          placeholder="U001:E01:CP1/A, U001:E02:CP1/B"
          className={`${smallInputClass} font-mono`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] uppercase tracking-wider text-zinc-400">Notes</label>
        <textarea
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          rows={2}
          placeholder="Admin notes"
          className={`${smallInputClass} resize-y`}
        />
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={form.is_false_lead}
            onChange={e => set('is_false_lead', e.target.checked)}
          />
          False lead
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <input
            type="checkbox"
            checked={form.discovered}
            onChange={e => set('discovered', e.target.checked)}
          />
          Discovered
        </label>
      </div>

      {!isNew && clue?.discovered && (
        <div className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
          Discovered {clue.discovered_at ? new Date(clue.discovered_at).toLocaleDateString() : ''}
          {clue.discovered_in_branch ? ` · ${clue.discovered_in_branch}` : ''}
          {clue.discovered_in_universe ? ` · ${clue.discovered_in_universe}` : ''}
        </div>
      )}

      {status && <p className="text-xs text-red-500">{status}</p>}

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving} className={btnClass}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {!isNew && (
          <button
            onClick={del}
            disabled={deleting}
            className="rounded border border-red-300 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CluesPage() {
  const [clues, setClues] = useState<Clue[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Clue | null | 'new'>(null)
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all')
  const [filterDiscovered, setFilterDiscovered] = useState<FilterDiscovered>('all')
  const [filterFalseLead, setFilterFalseLead] = useState(false)
  const [importStatus, setImportStatus] = useState('')

  const loadClues = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/clues')
    if (res.ok) setClues(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { loadClues() }, [loadClues])

  const filtered = clues.filter(c => {
    if (filterCategory !== 'all' && c.category !== filterCategory) return false
    if (filterDiscovered === 'discovered' && !c.discovered) return false
    if (filterDiscovered === 'undiscovered' && c.discovered) return false
    if (filterFalseLead && !c.is_false_lead) return false
    return true
  })

  function handleSaved(updated: Clue) {
    setClues(prev => {
      const idx = prev.findIndex(c => c.clue_id === updated.clue_id)
      return idx >= 0 ? prev.map((c, i) => i === idx ? updated : c) : [...prev, updated]
    })
    setSelected(updated)
  }

  function handleDeleted() {
    if (selected && selected !== 'new') {
      setClues(prev => prev.filter(c => c.clue_id !== (selected as Clue).clue_id))
    }
    setSelected(null)
  }

  async function exportCSV() {
    const res = await fetch('/api/admin/clues/export')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eigenthrope-clues-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus('Importing…')
    const text = await file.text()
    const res = await fetch('/api/admin/clues/import', {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv' },
      body: text,
    })
    const data = await res.json()
    setImportStatus(`Imported ${data.imported}${data.errors?.length ? ` · ${data.errors.length} errors` : ''}`)
    await loadClues()
    e.target.value = ''
  }

  const discoveredCount = clues.filter(c => c.discovered).length

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-black">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
              Clue Library
            </h1>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              {clues.length} clues · {discoveredCount} discovered
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/admin" className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
              ← Admin
            </a>
            <button onClick={exportCSV} className={btnClass}>Export CSV</button>
            <label className={`${btnClass} cursor-pointer`}>
              Import CSV
              <input type="file" accept=".csv" className="sr-only" onChange={importCSV} />
            </label>
            {importStatus && <span className="text-xs text-zinc-500">{importStatus}</span>}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-0">
        {/* Left: list */}
        <div className="flex w-72 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
          {/* Filters */}
          <div className="flex flex-col gap-2 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
            <div className="flex flex-wrap gap-1">
              {(['all', ...CATEGORIES.map(c => c.value)] as FilterCategory[]).map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                    filterCategory === cat
                      ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900'
                      : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <select
                value={filterDiscovered}
                onChange={e => setFilterDiscovered(e.target.value as FilterDiscovered)}
                className="flex-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                <option value="all">All</option>
                <option value="discovered">Discovered</option>
                <option value="undiscovered">Undiscovered</option>
              </select>
              <label className="flex items-center gap-1 text-[10px] text-zinc-500">
                <input
                  type="checkbox"
                  checked={filterFalseLead}
                  onChange={e => setFilterFalseLead(e.target.checked)}
                />
                False leads
              </label>
            </div>
          </div>

          {/* Clue list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-xs text-zinc-400">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-6 text-xs text-zinc-400">No clues match.</p>
            ) : (
              filtered.map(c => {
                const isSelected = selected !== 'new' && (selected as Clue)?.clue_id === c.clue_id
                return (
                  <button
                    key={c.clue_id}
                    onClick={() => setSelected(c)}
                    className={`flex w-full flex-col gap-1 border-b border-zinc-100 px-3 py-3 text-left transition-colors dark:border-zinc-800 ${
                      isSelected
                        ? 'bg-zinc-100 dark:bg-zinc-800'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">{c.clue_id}</span>
                      <CategoryBadge category={c.category} />
                      {c.is_false_lead && (
                        <span className="rounded bg-red-100 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-red-600 dark:bg-red-900/30 dark:text-red-400">
                          False
                        </span>
                      )}
                      {c.discovered && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-500" title="Discovered" />
                      )}
                    </div>
                    <p className="truncate text-[11px] text-zinc-500">{c.title}</p>
                  </button>
                )
              })
            )}
          </div>

          <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
            <button
              onClick={() => setSelected('new')}
              className="w-full rounded border border-dashed border-zinc-300 py-1.5 text-xs text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 dark:border-zinc-700 dark:hover:border-zinc-500"
            >
              + New clue
            </button>
          </div>
        </div>

        {/* Right: edit panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {selected === null && (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-zinc-400">Select a clue to edit, or create a new one.</p>
            </div>
          )}
          {selected === 'new' && (
            <ClueForm
              clue={null}
              onSaved={c => { handleSaved(c); setSelected(c) }}
              onDeleted={handleDeleted}
              onCancel={() => setSelected(null)}
            />
          )}
          {selected !== null && selected !== 'new' && (
            <ClueForm
              key={(selected as Clue).clue_id}
              clue={selected as Clue}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              onCancel={() => setSelected(null)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
