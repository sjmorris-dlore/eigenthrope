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
}

function decodeUri(hex: string | undefined): string | undefined {
  if (!hex) return undefined
  try {
    return Buffer.from(hex, 'hex').toString('utf8')
  } catch {
    return undefined
  }
}

async function fetchMetaName(uri: string): Promise<string | undefined> {
  try {
    const url = uri.startsWith('ipfs://')
      ? `https://cloudflare-ipfs.com/ipfs/${uri.slice(7)}`
      : uri
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return undefined
    const json = await res.json()
    return typeof json?.name === 'string' ? json.name : undefined
  } catch {
    return undefined
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
        // Fetch names from metadata
        const withMeta: NFTWithMeta[] = await Promise.all(
          mine.map(async n => {
            const uri = decodeUri(n.URI)
            const name = uri ? await fetchMetaName(uri) : undefined
            return { ...n, name }
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

                  return (
                    <div
                      key={nft.NFTokenID}
                      className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
                    >
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {nft.name ?? 'Eigenthrope Artifact'}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-zinc-400 break-all">
                        {nft.NFTokenID}
                      </p>

                      {isActive && qr && signUrl ? (
                        <div className="mt-4 flex flex-col items-center gap-3">
                          <p className="text-xs text-zinc-500">Scan with Xaman to burn</p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={qr} alt="Xaman burn QR" width={160} height={160} />
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
                      ) : (
                        <button
                          onClick={() => burn(nft)}
                          disabled={isBusy}
                          className="mt-3 rounded border border-red-200 px-3 py-1.5 text-xs text-red-500 hover:border-red-400 hover:text-red-700 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:border-red-700 dark:hover:text-red-300"
                        >
                          Burn
                        </button>
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
