'use client'

import { useRef, useEffect } from 'react'

export default function RabbitHoleMenu() {
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        ref.current.open = false
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('open') === 'rabbithole' && ref.current) {
      ref.current.open = true
      ref.current.scrollIntoView({ block: 'center' })
    }
  }, [])

  return (
    <details ref={ref} className="group relative">
      <summary className="cursor-pointer list-none text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
        Rabbit Hole
      </summary>

      <div className="fixed left-2 right-2 top-14 z-50 rounded-xl border border-zinc-200 bg-zinc-50 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-96">
        <div className="max-h-[70vh] overflow-y-auto p-5">
          <div className="space-y-5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">

            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">What is a blockchain?</p>
              <p className="mt-1">A blockchain is a ledger maintained by thousands of independent computers worldwide. Once something is written to it, no single party — not even the original author — can alter or erase it. Eigenthrope uses this property to make your votes permanent and publicly verifiable.</p>
              <a href="https://learn.xrpl.org" target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                learn.xrpl.org →
              </a>
            </div>

            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">What is the XRP Ledger?</p>
              <p className="mt-1">The XRP Ledger is an open-source blockchain that has been running continuously since 2012. It settles transactions in 3–5 seconds at a cost of a fraction of a cent — fast and cheap enough to record individual votes and mint collectibles without the environmental overhead of older chains.</p>
              <a href="https://xrpl.org" target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                xrpl.org →
              </a>
            </div>

            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">What is a crypto wallet?</p>
              <p className="mt-1">A crypto wallet doesn&apos;t hold currency the way a physical wallet holds cash. It holds a private key — a secret code that proves you own a particular address on the blockchain. When you &quot;sign&quot; a vote in Eigenthrope, your wallet uses that key to create a cryptographic signature. Nobody can forge it, and you don&apos;t need to trust us — the ledger verifies it independently.</p>
            </div>

            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">What is Xaman?</p>
              <p className="mt-1">Xaman is a self-custody wallet app for the XRP Ledger. It stores your private key on your phone and lets you sign transactions by approving a push notification or scanning a QR code. Eigenthrope uses Xaman to sign your votes — you stay in control of your keys at all times.</p>
              <a href="https://xaman.app" target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                xaman.app →
              </a>
            </div>

            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">What is an NFT?</p>
              <p className="mt-1">A non-fungible token is a unique digital record on a blockchain. Unlike currency where every unit is interchangeable, each NFT is distinct. Your Observer Artifacts are NFTs — each one is proof that you voted in a specific episode, carrying a permanent record of which side you were on and whether it won.</p>
              <a href="https://xrpl.org/docs/concepts/tokens/nfts/" target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                XRPL NFT docs →
              </a>
            </div>

            <div>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">What is a hackathon?</p>
              <p className="mt-1">A hackathon is a focused sprint where developers, writers, and designers build something real from scratch — usually over a few weeks. Eigenthrope was conceived and built during an XRPL Commons hackathon. Every transaction the game sends to the ledger carries a source tag that permanently links it to the event that brought it into existence.</p>
              <div className="mt-1.5 flex flex-col gap-1">
                <a href="https://hackathons.xrpl-commons.org/hackathons/6a270bd8783bff75041f8ce6" target="_blank" rel="noopener noreferrer" className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                  The hackathon →
                </a>
                <a href="https://hackathons.xrpl-commons.org/teams/6a3a36c8646f47e36fdff53b" target="_blank" rel="noopener noreferrer" className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                  Our project entry →
                </a>
              </div>
            </div>

          </div>
        </div>
      </div>
    </details>
  )
}
