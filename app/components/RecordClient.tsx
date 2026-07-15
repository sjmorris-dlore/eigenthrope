'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import WalletConnect from '@/app/components/WalletConnect'

interface PublicSeal {
  seal_id: string
  account: string
  alias?: string
  status: 'sealed' | 'revealed' | 'vindicated' | 'denied'
  hash: string
  context: string
  sealed_at?: string
  tx_hash?: string
  revealed_at?: string
  judged_at?: string
  judgment_note?: string
  text?: string
  salt?: string
  own_text?: string
}

const SEAL_CAP = 3
const TEXT_MAX = 500

// Generic claim-shapes — starting points that could apply to any mystery
// ever written. Optional; free text is always allowed.
const STEMS = [
  '___ and ___ are the same entity.',
  'The ___ will return.',
  'What connects the chapters is ___.',
  "The watcher's purpose is ___.",
  '___ is not what it appears to be; it is actually ___.',
]

const STATUS_STYLES: Record<PublicSeal['status'], { label: string; cls: string }> = {
  sealed: { label: 'Sealed', cls: 'border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400' },
  revealed: { label: 'Revealed — awaiting the story', cls: 'border-sky-300 text-sky-600 dark:border-sky-800 dark:text-sky-400' },
  vindicated: { label: 'Vindicated', cls: 'border-amber-400 text-amber-600 dark:border-amber-600 dark:text-amber-400' },
  denied: { label: 'Denied', cls: 'border-rose-300 text-rose-500 dark:border-rose-800 dark:text-rose-400' },
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…`
}

function fmtDate(iso?: string) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function RecordClient() {
  const [account, setAccount] = useState<string | null>(null)
  const [jwt, setJwt] = useState<string | null>(null)
  const [seals, setSeals] = useState<PublicSeal[]>([])
  const [loading, setLoading] = useState(true)

  // Seal form
  const [text, setText] = useState('')
  const [sealing, setSealing] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const [signUrl, setSignUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [justSealed, setJustSealed] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Reveal confirm state: seal_id armed for reveal
  const [armedReveal, setArmedReveal] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)

  const load = useCallback(async (token: string | null) => {
    try {
      const res = await fetch('/api/record', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const data = await res.json()
      if (res.ok) setSeals(data.seals ?? [])
    } catch { /* transient */ }
    setLoading(false)
  }, [])

  useEffect(() => { void load(jwt) }, [jwt, load])
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const mySealedCount = account
    ? seals.filter(s => s.account === account && s.status === 'sealed').length
    : 0

  async function seal() {
    if (!account || sealing) return
    setSealing(true)
    setError(null)
    setJustSealed(false)
    try {
      const res = await fetch('/api/record/payload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, account }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not create the seal')
        setSealing(false)
        return
      }
      setQr(data.qr)
      setSignUrl(data.signUrl)

      pollRef.current = setInterval(async () => {
        try {
          const status = await fetch(`/api/record/${data.uuid}`)
          const s = await status.json()
          if (s.sealed) {
            clearInterval(pollRef.current!)
            setQr(null); setSignUrl(null); setSealing(false)
            setText('')
            setJustSealed(true)
            void load(jwt)
          } else if (s.expired || s.rejected) {
            clearInterval(pollRef.current!)
            setQr(null); setSignUrl(null); setSealing(false)
          }
        } catch { /* keep polling */ }
      }, 2500)
    } catch {
      setError('Request failed')
      setSealing(false)
    }
  }

  async function reveal(sealId: string) {
    if (!jwt || revealing) return
    setRevealing(true)
    try {
      const res = await fetch('/api/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ seal_id: sealId }),
      })
      if (res.ok) void load(jwt)
    } catch { /* transient */ }
    setArmedReveal(null)
    setRevealing(false)
  }

  return (
    <div className="flex flex-col gap-12">

      {/* Wallet + seal form */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
            Seal an observation
          </p>
          <WalletConnect onAccountChange={(a, token) => { setAccount(a); setJwt(token ?? null) }} />
        </div>

        {!account ? (
          <p className="mt-4 text-sm text-zinc-400 dark:text-zinc-500">
            Connect your wallet to commit an observation to the Record.
          </p>
        ) : qr ? (
          <div className="mt-4 flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="Sign in Xaman" className="w-44 rounded" />
            {signUrl && (
              <a href={signUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs underline underline-offset-4 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                Open in Xaman
              </a>
            )}
            <p className="text-xs text-zinc-400">Signing writes only the fingerprint to the ledger — never the text.</p>
            <button
              onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setQr(null); setSignUrl(null); setSealing(false) }}
              className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <textarea
              value={text}
              onChange={e => setText(e.target.value.slice(0, TEXT_MAX))}
              placeholder="What have you observed? Claims about pattern, mechanism, and what connects the chapters are the ones that survive the cast changing…"
              rows={3}
              className="w-full rounded border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-600"
            />
            <div className="flex flex-wrap gap-1.5">
              {STEMS.map(stem => (
                <button
                  key={stem}
                  type="button"
                  onClick={() => setText(stem)}
                  className="rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] text-zinc-400 hover:border-zinc-300 hover:text-zinc-600 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:text-zinc-300"
                >
                  {stem}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-zinc-400">
                {text.length}/{TEXT_MAX} · {mySealedCount}/{SEAL_CAP} seals held
              </p>
              <button
                onClick={seal}
                disabled={sealing || text.trim().length < 10 || mySealedCount >= SEAL_CAP}
                className="rounded bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {sealing ? 'Sealing…' : 'Seal it'}
              </button>
            </div>
            {mySealedCount >= SEAL_CAP && (
              <p className="text-xs text-zinc-400">
                The Record holds at most {SEAL_CAP} sealed observations per observer — reveal one to seal another.
              </p>
            )}
            {justSealed && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Sealed. The ledger holds your fingerprint; the text stays yours until you reveal it.
              </p>
            )}
            {error && <p className="text-xs text-rose-500">{error}</p>}
          </div>
        )}
      </div>

      {/* The board */}
      <div className="flex flex-col gap-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
          The Record
        </p>

        {loading ? (
          <p className="text-sm italic text-zinc-400">Consulting the ledger…</p>
        ) : seals.length === 0 ? (
          <p className="text-sm italic text-zinc-400 dark:text-zinc-500">
            Nothing has been sealed yet. Be the first observer on the record.
          </p>
        ) : (
          seals.map(s => {
            const style = STATUS_STYLES[s.status]
            const isMine = account === s.account
            const revealedText = s.text
            return (
              <div key={s.seal_id} className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {s.alias ?? shortAddress(s.account)}
                    {isMine && <span className="ml-2 text-[10px] uppercase tracking-widest text-zinc-400">you</span>}
                  </p>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${style.cls}`}>
                    {style.label}
                  </span>
                </div>

                <p className="mt-1 text-[11px] text-zinc-400">
                  sealed {fmtDate(s.sealed_at)} · {s.context} ·{' '}
                  {s.tx_hash ? (
                    <a href={`https://bithomp.com/explorer/${s.tx_hash}`} target="_blank" rel="noopener noreferrer"
                      className="font-mono underline-offset-2 hover:underline">
                      {shortHash(s.hash)}
                    </a>
                  ) : (
                    <span className="font-mono">{shortHash(s.hash)}</span>
                  )}
                </p>

                {revealedText ? (
                  <>
                    <p className="mt-3 text-sm leading-6 text-zinc-800 dark:text-zinc-200">
                      “{revealedText}”
                    </p>
                    {s.judgment_note && (
                      <p className="mt-2 text-xs italic text-zinc-400">— {s.judgment_note}</p>
                    )}
                  </>
                ) : s.own_text ? (
                  <>
                    <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                      “{s.own_text}” <span className="text-[10px] uppercase tracking-widest text-zinc-400">only you see this</span>
                    </p>
                    <div className="mt-3">
                      {armedReveal === s.seal_id ? (
                        <span className="flex items-center gap-3">
                          <button
                            onClick={() => reveal(s.seal_id)}
                            disabled={revealing}
                            className="rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-40"
                          >
                            {revealing ? 'Revealing…' : 'Yes — make it public forever'}
                          </button>
                          <button onClick={() => setArmedReveal(null)} className="text-xs text-zinc-400 hover:text-zinc-600">
                            Keep it sealed
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setArmedReveal(s.seal_id)}
                          className="rounded bg-sky-600 px-3 py-1 text-xs font-medium text-white hover:bg-sky-500 dark:bg-sky-700 dark:hover:bg-sky-600"
                        >
                          Reveal
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-sm italic text-zinc-400 dark:text-zinc-600">
                    An observation, sealed. Its content is known only to its author — and the ledger will prove when it was made.
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
