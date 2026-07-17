'use client'

import { useCallback, useEffect, useState } from 'react'

interface AdminSeal {
  seal_id: string
  account: string
  status: 'sealed' | 'revealed' | 'vindicated' | 'denied'
  text: string
  hash: string
  context: string
  sealed_at?: string
  tx_hash?: string
  revealed_at?: string
  judged_at?: string
  judgment_note?: string
  trophy_requested_at?: string
}

interface VindicationArt {
  uri: string
  image_key?: string
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/**
 * The Record — reveal-driven judging. Revealed seals awaiting a verdict
 * surface at the top; the verdict is canon. Sealed entries are listed
 * collapsed for reference (text hidden by default even here — reading
 * sealed theories early is your prerogative as author, but make it a
 * deliberate click, not an accident).
 */
export default function AdminRecordJudge() {
  const [seals, setSeals] = useState<AdminSeal[]>([])
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [peeked, setPeeked] = useState<Set<string>>(new Set())
  const [armedDelete, setArmedDelete] = useState<string | null>(null)
  const [vindication, setVindication] = useState<VindicationArt | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState('')
  const [mintStatus, setMintStatus] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/record')
      const data = await res.json()
      if (res.ok) {
        setSeals(data.seals ?? [])
        setVindication(data.vindication ?? null)
      }
    } catch { /* transient */ }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function judge(sealId: string, verdict: 'vindicated' | 'denied' | 'revealed') {
    setBusy(sealId)
    try {
      await fetch('/api/admin/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seal_id: sealId, verdict, note: notes[sealId] ?? '' }),
      })
      await load()
    } catch { /* transient */ }
    setBusy(null)
  }

  async function uploadArt(file: File) {
    setUploading(true)
    setUploadStatus('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('type', 'vindication')
      const res = await fetch('/api/admin/upload-nft-image', { method: 'POST', body: form })
      const data = await res.json()
      if (res.ok) { setUploadStatus('Pinned.'); await load() }
      else setUploadStatus(`Error: ${data.error}`)
    } catch { setUploadStatus('Error: upload failed.') }
    setUploading(false)
  }

  async function mintTrophy(sealId: string) {
    setBusy(sealId)
    setMintStatus(prev => ({ ...prev, [sealId]: '' }))
    try {
      const res = await fetch('/api/admin/record-mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seal_id: sealId }),
      })
      const data = await res.json()
      setMintStatus(prev => ({ ...prev, [sealId]: res.ok ? 'Mint started — offer lands shortly.' : `Error: ${data.error}` }))
      if (res.ok) await load()
    } catch {
      setMintStatus(prev => ({ ...prev, [sealId]: 'Error: request failed.' }))
    }
    setBusy(null)
  }

  async function remove(sealId: string) {
    setBusy(sealId)
    try {
      await fetch('/api/admin/record', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seal_id: sealId }),
      })
      await load()
    } catch { /* transient */ }
    setArmedDelete(null)
    setBusy(null)
  }

  function DeleteButton({ sealId }: { sealId: string }) {
    return armedDelete === sealId ? (
      <span className="inline-flex items-center gap-2">
        <button
          onClick={() => remove(sealId)}
          disabled={busy === sealId}
          className="text-[11px] font-medium text-red-600 underline underline-offset-2 hover:text-red-500 disabled:opacity-40"
        >
          Confirm delete
        </button>
        <button onClick={() => setArmedDelete(null)} className="text-[11px] text-zinc-400 hover:text-zinc-600">
          keep
        </button>
      </span>
    ) : (
      <button
        onClick={() => setArmedDelete(sealId)}
        className="text-[11px] text-zinc-400 underline underline-offset-2 hover:text-red-500"
      >
        Delete (test data)
      </button>
    )
  }

  const open = seals.filter(s => s.status === 'revealed')
  const rest = seals.filter(s => s.status !== 'revealed')

  if (loading) return <p className="text-xs text-zinc-400">Loading the Record…</p>

  const artSlot = (
    <div className="flex items-center gap-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      {vindication?.image_key ? (
        <div className="h-16 w-9 shrink-0 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/nft-image?key=${encodeURIComponent(vindication.image_key)}`} alt="Vindication Artifact" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex h-16 w-9 shrink-0 items-center justify-center rounded bg-zinc-100 text-lg dark:bg-zinc-800">?</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Vindication Artifact</p>
        <p className="mt-0.5 text-[11px] text-zinc-400">
          {vindication?.uri
            ? 'Artwork pinned — trophies can mint.'
            : 'No artwork yet — upload an image before minting trophies.'}
        </p>
        <label className="mt-1 inline-block cursor-pointer text-[11px] underline underline-offset-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          {uploading ? 'Uploading…' : vindication?.uri ? 'Replace image' : 'Upload image'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={e => { const f = e.target.files?.[0]; if (f) void uploadArt(f); e.target.value = '' }}
          />
        </label>
        {uploadStatus && <span className="ml-2 text-[11px] text-zinc-400">{uploadStatus}</span>}
      </div>
    </div>
  )

  if (seals.length === 0) {
    return (
      <div className="space-y-4">
        {artSlot}
        <p className="text-xs text-zinc-400">Nothing sealed yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {artSlot}
      {open.length === 0 ? (
        <p className="text-xs text-zinc-400">No reveals awaiting judgment.</p>
      ) : (
        open.map(s => (
          <div key={s.seal_id} className="rounded-lg border border-sky-300 p-4 dark:border-sky-800">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">
              Awaiting verdict — revealed {s.revealed_at?.slice(0, 10)}
            </p>
            <p className="mt-1 text-xs text-zinc-400">
              {shortAddress(s.account)} · sealed {s.sealed_at?.slice(0, 10)} · {s.context}
            </p>
            <p className="mt-2 text-sm text-zinc-800 dark:text-zinc-200">“{s.text}”</p>
            <input
              value={notes[s.seal_id] ?? ''}
              onChange={e => setNotes(prev => ({ ...prev, [s.seal_id]: e.target.value }))}
              placeholder="Optional public note shown with the verdict"
              className="mt-3 w-full rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => judge(s.seal_id, 'vindicated')}
                disabled={busy === s.seal_id}
                className="rounded bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-400 disabled:opacity-40"
              >
                Vindicate
              </button>
              <button
                onClick={() => judge(s.seal_id, 'denied')}
                disabled={busy === s.seal_id}
                className="rounded bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-40"
              >
                Deny
              </button>
              <span className="ml-auto self-center inline-flex items-center gap-3">
                <span className="text-[10px] text-zinc-400">or leave open — the story may not have spoken yet</span>
                <DeleteButton sealId={s.seal_id} />
              </span>
            </div>
          </div>
        ))
      )}

      {rest.length > 0 && (
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300">
            All entries ({rest.length})
          </summary>
          <div className="mt-2 space-y-2">
            {rest.map(s => (
              <div key={s.seal_id} className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
                <p>
                  <span className="font-bold uppercase tracking-widest text-[10px]">{s.status}</span>
                  {' · '}{shortAddress(s.account)} · sealed {s.sealed_at?.slice(0, 10)} · {s.context}
                </p>
                {s.status === 'sealed' ? (
                  <>
                    {peeked.has(s.seal_id) ? (
                      <p className="mt-1 text-zinc-500 dark:text-zinc-400">“{s.text}”</p>
                    ) : (
                      <button
                        onClick={() => setPeeked(prev => new Set(prev).add(s.seal_id))}
                        className="mt-1 text-[11px] underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300"
                      >
                        Peek at sealed text (author&apos;s eyes only)
                      </button>
                    )}
                    <div className="mt-1"><DeleteButton sealId={s.seal_id} /></div>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-zinc-500 dark:text-zinc-400">“{s.text}”</p>
                    {s.judgment_note && <p className="mt-1 italic">— {s.judgment_note}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      {s.status === 'vindicated' && (
                        s.trophy_requested_at ? (
                          <span className="text-[11px] text-amber-600 dark:text-amber-400">
                            Trophy minted {s.trophy_requested_at.slice(0, 10)}
                          </span>
                        ) : (
                          <button
                            onClick={() => mintTrophy(s.seal_id)}
                            disabled={busy === s.seal_id || !vindication?.uri}
                            title={vindication?.uri ? undefined : 'Upload the Vindication Artifact artwork first'}
                            className="rounded bg-amber-500 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-amber-400 disabled:opacity-40"
                          >
                            {busy === s.seal_id ? 'Minting…' : 'Mint Trophy'}
                          </button>
                        )
                      )}
                      <button
                        onClick={() => judge(s.seal_id, 'revealed')}
                        disabled={busy === s.seal_id}
                        className="text-[11px] underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300"
                      >
                        Reopen (clear verdict)
                      </button>
                      <DeleteButton sealId={s.seal_id} />
                    </div>
                    {mintStatus[s.seal_id] && (
                      <p className="mt-1 text-[11px] text-zinc-400">{mintStatus[s.seal_id]}</p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
