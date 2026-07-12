'use client'

import { useEffect, useRef, useState } from 'react'

export interface BazaarCardData {
  offer_index: string
  chapter_label?: string
  choice_point: string
  artifact_type: 'winner' | 'participation'
  image_key?: string
  amount_drops: string
  seller_display: string
}

export default function BazaarCard({ listing }: { listing: BazaarCardData }) {
  const [qr, setQr] = useState<string | null>(null)
  const [signUrl, setSignUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const xrp = Number(listing.amount_drops) / 1_000_000

  async function run(action: 'accept' | 'cancel') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/bazaar/payload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, offer_index: listing.offer_index }),
      })
      const data = await res.json()
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Request failed'); setBusy(false); return }
      setQr(data.qr)
      setSignUrl(data.signUrl)

      intervalRef.current = setInterval(async () => {
        const status = await fetch(`/api/vote/${data.uuid}`)
        const s = await status.json()
        if (s.signed) {
          clearInterval(intervalRef.current!)
          setQr(null); setSignUrl(null); setBusy(false)
          if (!s.dispatched_result || s.dispatched_result === 'tesSUCCESS') {
            setDone(action === 'accept' ? 'Acquired — it will appear in your wallet.' : 'Listing withdrawn.')
          } else {
            setError(`Transaction failed: ${s.dispatched_result}`)
          }
        } else if (s.expired || s.rejected) {
          clearInterval(intervalRef.current!)
          setQr(null); setSignUrl(null); setBusy(false)
        }
      }, 2000)
    } catch {
      setError('Request failed')
      setBusy(false)
    }
  }

  const typeLabel = listing.artifact_type === 'winner' ? 'Winner Artifact' : 'Participation Artifact'

  if (done) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
        {done}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      {listing.image_key && (
        <div className="mb-3 aspect-[9/16] w-full overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/nft-image?key=${encodeURIComponent(listing.image_key)}`}
            alt={`${listing.chapter_label ?? listing.choice_point} ${typeLabel}`}
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">{typeLabel}</p>
      <p className="mt-0.5 text-sm font-medium text-zinc-900 dark:text-zinc-50">
        {listing.chapter_label ?? listing.choice_point}
      </p>
      <p className="mt-1 text-xs text-zinc-400">seller: {listing.seller_display}</p>

      {qr ? (
        <div className="mt-3 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Sign in Xaman" className="w-40 rounded" />
          {signUrl && (
            <a href={signUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline underline-offset-4 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
              Open in Xaman
            </a>
          )}
          <button onClick={() => { if (intervalRef.current) clearInterval(intervalRef.current); setQr(null); setSignUrl(null); setBusy(false) }} className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            onClick={() => run('accept')}
            disabled={busy}
            className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Buy · {xrp} XRP
          </button>
          <button
            onClick={() => run('cancel')}
            disabled={busy}
            title="Sellers only — the ledger rejects anyone else's signature"
            className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Withdraw
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  )
}
