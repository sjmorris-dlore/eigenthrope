'use client'

import { useEffect, useState } from 'react'

/**
 * Opt-in public display name for the leaderboard. Writes are authorized by
 * the Xaman session token (proof of wallet ownership) — the server derives
 * the account from the token, never from the client.
 */
export default function AliasForm({ account, jwt }: { account: string; jwt: string | null }) {
  const [alias, setAlias] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setSaved(null)
    setStatus('')
    fetch(`/api/alias?account=${encodeURIComponent(account)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data?.alias) { setSaved(data.alias); setAlias(data.alias) }
      })
      .catch(() => {})
  }, [account])

  async function save() {
    if (!jwt) { setStatus('Reconnect your wallet to set a name.'); return }
    setBusy(true)
    setStatus('')
    try {
      const res = await fetch('/api/alias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ alias }),
      })
      const data = await res.json()
      if (res.ok) { setSaved(data.alias); setStatus('Saved.') }
      else setStatus(data.error ?? 'Failed to save.')
    } catch { setStatus('Failed to save.') }
    setBusy(false)
  }

  async function remove() {
    if (!jwt) { setStatus('Reconnect your wallet to remove your name.'); return }
    setBusy(true)
    setStatus('')
    try {
      const res = await fetch('/api/alias', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jwt}` },
      })
      if (res.ok) { setSaved(null); setAlias(''); setStatus('Removed — you now appear by wallet.') }
      else setStatus('Failed to remove.')
    } catch { setStatus('Failed to remove.') }
    setBusy(false)
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Leaderboard display name</p>
      <p className="mt-1 text-xs text-zinc-500">
        Optional and public: shown next to your wallet on the leaderboard. Leave unset to appear
        by wallet address only.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <input
          value={alias}
          onChange={e => setAlias(e.target.value)}
          maxLength={20}
          placeholder="display name"
          className="w-full rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        />
        <button
          onClick={save}
          disabled={busy || !alias.trim() || alias.trim() === saved}
          className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-700 dark:hover:bg-zinc-600"
        >
          {busy ? '…' : 'Save'}
        </button>
        {saved && (
          <button
            onClick={remove}
            disabled={busy}
            className="rounded px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-600 disabled:opacity-40 dark:hover:text-zinc-300"
          >
            Remove
          </button>
        )}
      </div>
      {status && <p className="mt-2 text-xs text-zinc-500">{status}</p>}
    </div>
  )
}
