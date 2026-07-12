'use client'

import { useState, useEffect, useRef } from 'react'
import WalletConnect from '@/app/components/WalletConnect'
import AliasForm from '@/app/components/AliasForm'

const XRPL_RPC = 'https://xrplcluster.com/'
const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS ?? 'rwU5e8C8sBjgDfuYwLGwTe9zAnf5TYxrsn'

interface XrplNFT {
  NFTokenID: string
  Issuer: string
  URI?: string
  Flags: number
}

interface NFTWithMeta extends XrplNFT {
  name?: string
  /** Direct image URL from the NFT's own metadata (fallback) */
  metaImage?: string
  /** Game-side metadata from the minting records */
  chapterLabel?: string
  artifactType?: 'winner' | 'participation'
  imageKey?: string
}

function decodeUri(hex: string | undefined): string | undefined {
  if (!hex) return undefined
  try {
    return Buffer.from(hex, 'hex').toString('utf8')
  } catch {
    return undefined
  }
}

function ipfsToHttp(uri: string): string {
  return uri.startsWith('ipfs://')
    ? `https://cloudflare-ipfs.com/ipfs/${uri.slice(7)}`
    : uri
}

async function fetchNftMeta(uri: string): Promise<{ name?: string; image?: string }> {
  try {
    const res = await fetch(ipfsToHttp(uri), { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return {}
    const json = await res.json()
    return {
      name: typeof json?.name === 'string' ? json.name : undefined,
      image: typeof json?.image === 'string' ? ipfsToHttp(json.image) : undefined,
    }
  } catch {
    return {}
  }
}

export default function WalletPage() {
  const [account, setAccount] = useState<string | null>(null)
  const [jwt, setJwt] = useState<string | null>(null)
  const [nfts, setNfts] = useState<NFTWithMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [activeToken, setActiveToken] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [signUrl, setSignUrl] = useState<string | null>(null)
  const [burned, setBurned] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [listingToken, setListingToken] = useState<string | null>(null)
  const [listPrice, setListPrice] = useState('')
  const [listed, setListed] = useState<Set<string>>(new Set())
  const [pendingAction, setPendingAction] = useState<'burn' | 'list'>('burn')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!account) { setNfts([]); return }
    setLoading(true)
    fetch(XRPL_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'account_nfts', params: [{ account }] }),
    })
      .then(r => r.json())
      .then(async data => {
        const all: XrplNFT[] = data.result?.account_nfts ?? []
        const mine = all.filter(n => n.Issuer === VAULT_ADDRESS)

        // Game-side metadata (chapter, type, artifact image) in one call
        const gameMeta: Record<string, { chapter_label?: string; artifact_type?: 'winner' | 'participation'; image_key?: string }> =
          mine.length > 0
            ? await fetch(`/api/artifact-meta?ids=${mine.map(n => n.NFTokenID).join(',')}`)
                .then(r => (r.ok ? r.json() : { meta: {} }))
                .then(d => d.meta ?? {})
                .catch(() => ({}))
            : {}

        // NFT's own metadata as fallback for anything the game tables don't know
        const withMeta: NFTWithMeta[] = await Promise.all(
          mine.map(async n => {
            const game = gameMeta[n.NFTokenID]
            const uri = decodeUri(n.URI)
            const own = uri && (!game || !game.image_key) ? await fetchNftMeta(uri) : {}
            return {
              ...n,
              name: own.name,
              metaImage: own.image,
              chapterLabel: game?.chapter_label,
              artifactType: game?.artifact_type,
              imageKey: game?.image_key,
            }
          })
        )
        setNfts(withMeta)
      })
      .catch(() => setNfts([]))
      .finally(() => setLoading(false))
  }, [account])

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const burn = async (nft: NFTWithMeta) => {
    if (!account) return
    setError(null)
    setActiveToken(nft.NFTokenID)
    setPendingAction('burn')

    const res = await fetch('/api/wallet/burn-nft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, nft_token_id: nft.NFTokenID }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(JSON.stringify(data.error ?? data))
      setActiveToken(null)
      return
    }

    setQr(data.qr)
    setSignUrl(data.signUrl)

    intervalRef.current = setInterval(async () => {
      const status = await fetch(`/api/vote/${data.uuid}`)
      const s = await status.json()
      if (s.signed) {
        clearInterval(intervalRef.current!)
        setQr(null)
        setSignUrl(null)
        setActiveToken(null)
        if (!s.dispatched_result || s.dispatched_result === 'tesSUCCESS') {
          setBurned(prev => new Set([...prev, nft.NFTokenID]))
        } else {
          setError(`Transaction failed: ${s.dispatched_result}`)
        }
      } else if (s.expired || s.rejected) {
        clearInterval(intervalRef.current!)
        setQr(null)
        setSignUrl(null)
        setActiveToken(null)
      }
    }, 2000)
  }

  const cancel = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setQr(null)
    setSignUrl(null)
    setActiveToken(null)
    setListingToken(null)
  }

  const list = async (nft: NFTWithMeta) => {
    const amountXrp = Number(listPrice)
    if (!Number.isFinite(amountXrp) || amountXrp <= 0) {
      setError('Enter a price in XRP')
      return
    }
    setError(null)
    setActiveToken(nft.NFTokenID)
    setPendingAction('list')

    const res = await fetch('/api/bazaar/payload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', nft_token_id: nft.NFTokenID, amount_xrp: amountXrp }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : JSON.stringify(data.error ?? data))
      setActiveToken(null)
      return
    }

    setQr(data.qr)
    setSignUrl(data.signUrl)

    intervalRef.current = setInterval(async () => {
      const status = await fetch(`/api/vote/${data.uuid}`)
      const s = await status.json()
      if (s.signed) {
        clearInterval(intervalRef.current!)
        setQr(null)
        setSignUrl(null)
        setActiveToken(null)
        setListingToken(null)
        if (!s.dispatched_result || s.dispatched_result === 'tesSUCCESS') {
          setListed(prev => new Set([...prev, nft.NFTokenID]))
        } else {
          setError(`Transaction failed: ${s.dispatched_result}`)
        }
      } else if (s.expired || s.rejected) {
        clearInterval(intervalRef.current!)
        setQr(null)
        setSignUrl(null)
        setActiveToken(null)
      }
    }, 2000)
  }

  const visible = nfts.filter(n => !burned.has(n.NFTokenID))

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 sm:px-8 dark:bg-black">
      <main className="flex w-full max-w-sm flex-col gap-8">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">
            Wallet
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Your Artifacts
          </h1>
        </div>

        <WalletConnect onAccountChange={(acct, token) => { setAccount(acct); setJwt(token ?? null) }} />

        {account && (
          <>
            <AliasForm account={account} jwt={jwt} />
            {loading && (
              <p className="text-sm text-zinc-400">Loading…</p>
            )}

            {!loading && visible.length === 0 && (
              <p className="text-sm text-zinc-400">
                No Eigenthrope artifacts in this wallet.
              </p>
            )}

            {!loading && visible.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-zinc-500">
                  {visible.length} artifact{visible.length !== 1 ? 's' : ''} from Eigenthrope
                </p>
                {error && <p className="text-xs text-red-500">{error}</p>}

                {visible.map(nft => {
                  const isActive = activeToken === nft.NFTokenID
                  const isBusy = activeToken !== null && !isActive

                  const thumb = nft.imageKey
                    ? `/api/nft-image?key=${encodeURIComponent(nft.imageKey)}`
                    : nft.metaImage
                  const typeLabel = nft.artifactType === 'winner' ? 'Winner Artifact'
                    : nft.artifactType === 'participation' ? 'Participation Artifact'
                    : undefined

                  return (
                    <div
                      key={nft.NFTokenID}
                      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <div className="flex items-start gap-3">
                        {thumb && (
                          <div className="h-24 w-14 shrink-0 overflow-hidden rounded-lg">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumb}
                              alt={typeLabel ?? nft.name ?? 'Artifact'}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        )}
                        <div className="min-w-0">
                          {typeLabel && (
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
                              {typeLabel}
                            </p>
                          )}
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                            {nft.chapterLabel ?? nft.name ?? 'Eigenthrope Artifact'}
                          </p>
                          <p className="mt-0.5 font-mono text-[10px] text-zinc-400 break-all">
                            {nft.NFTokenID}
                          </p>
                        </div>
                      </div>

                      {isActive && qr && signUrl ? (
                        <div className="mt-4 flex flex-col items-center gap-3">
                          <p className="text-xs text-zinc-500">
                            Scan with Xaman to {pendingAction === 'burn' ? 'burn' : 'list for sale'}
                          </p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qr} alt="Xaman QR" width={160} height={160} />
                          <a
                            href={signUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-zinc-500 underline"
                          >
                            Open in Xaman
                          </a>
                          <button onClick={cancel} className="text-xs text-zinc-400 underline">
                            Cancel
                          </button>
                        </div>
                      ) : listed.has(nft.NFTokenID) ? (
                        <p className="mt-3 text-xs text-zinc-500">Listed on the bazaar.</p>
                      ) : listingToken === nft.NFTokenID ? (
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={listPrice}
                            onChange={e => setListPrice(e.target.value)}
                            placeholder="price in XRP"
                            className="w-28 rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs text-zinc-900 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                          />
                          <button
                            onClick={() => list(nft)}
                            disabled={isBusy}
                            className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                          >
                            List
                          </button>
                          <button
                            onClick={() => { setListingToken(null); setListPrice('') }}
                            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 flex items-center gap-2">
                          <button
                            onClick={() => { setListingToken(nft.NFTokenID); setListPrice('') }}
                            disabled={isBusy}
                            className="rounded border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
                          >
                            List for sale
                          </button>
                          <button
                            onClick={() => burn(nft)}
                            disabled={isBusy}
                            className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:border-red-400 hover:text-red-700 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:border-red-700 dark:hover:text-red-300"
                          >
                            Burn
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {burned.size > 0 && (
              <p className="text-xs text-zinc-400">
                {burned.size} artifact{burned.size !== 1 ? 's' : ''} burned this session.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  )
}
