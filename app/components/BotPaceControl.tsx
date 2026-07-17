'use client'

import { useEffect, useState } from 'react'

/**
 * Admin lever for observer chatter speed. Multiplier on top of the active
 * timing mode (test or prod): delays ×N, idle frequency ÷N. 1 = normal,
 * 2 = half as chatty, 0.5 = faster. Bots pick changes up within a minute.
 */
export default function BotPaceControl() {
  const [pace, setPace] = useState<number | null>(null)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch('/api/admin/bot-pace')
      .then(r => r.json())
      .then(d => { setPace(d.pace ?? 1); setInput(String(d.pace ?? 1)) })
      .catch(() => { setPace(1); setInput('1') })
  }, [])

  async function save(value: number) {
    setSaving(true)
    setStatus('')
    try {
      const res = await fetch('/api/admin/bot-pace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pace: value }),
      })
      const data = await res.json()
      if (res.ok) { setPace(value); setInput(String(value)); setStatus('Saved') }
      else setStatus(data.error ?? 'Failed')
    } catch { setStatus('Failed') }
    setSaving(false)
    setTimeout(() => setStatus(''), 3000)
  }

  const parsed = parseFloat(input)
  const valid = Number.isFinite(parsed) && parsed >= 0.25 && parsed <= 10
  const dirty = pace !== null && valid && parsed !== pace

  return (
    <span className="inline-flex items-center gap-1.5" title="Observer chatter speed: delays ×N, idle frequency ÷N. 1 = normal, 2 = half as chatty. Applies within a minute; already-scheduled posts keep their times.">
      <span className="text-[11px] text-zinc-400">Bot pace ×</span>
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && dirty) void save(parsed) }}
        disabled={pace === null || saving}
        className="w-12 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-center text-xs dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
      />
      {dirty && (
        <button
          onClick={() => save(parsed)}
          disabled={saving}
          className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-700 dark:hover:bg-zinc-600"
        >
          {saving ? '…' : 'Set'}
        </button>
      )}
      {status && <span className="text-[11px] text-zinc-400">{status}</span>}
      {!valid && input !== '' && <span className="text-[11px] text-rose-500">0.25–10</span>}
    </span>
  )
}
