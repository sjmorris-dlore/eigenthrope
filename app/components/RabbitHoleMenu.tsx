'use client'

export default function RabbitHoleMenu() {
  return (
    <details className="group relative">
      <summary className="cursor-pointer list-none text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
        Rabbit Hole
      </summary>

      <div className="fixed left-2 right-2 top-14 z-50 rounded-xl border border-zinc-200 bg-zinc-50 p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-2 sm:w-96">
        <div className="space-y-5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">

          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">What is a blockchain?</p>
            <p className="mt-1">A blockchain is a ledger maintained by thousands of independent computers worldwide. Once something is written to it, no single party — not even the original author — can alter or erase it. Eigenthrope uses this property to make your votes permanent and publicly verifiable.</p>
          </div>

          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">What is the XRP Ledger?</p>
            <p className="mt-1">The XRP Ledger is an open-source blockchain that has been running continuously since 2012. It settles transactions in 3–5 seconds at a cost of a fraction of a cent — fast and cheap enough to record individual votes and mint collectibles without the environmental overhead of older chains.</p>
            <a
              href="https://xrpl.org"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-block text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              xrpl.org →
            </a>
          </div>

          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">What is an NFT?</p>
            <p className="mt-1">A non-fungible token is a unique digital record on a blockchain. Unlike currency where every unit is interchangeable, each NFT is distinct. Your Observer Artifacts are NFTs — each one is proof that you voted in a specific episode, carrying a permanent record of which side you were on and whether it won.</p>
          </div>

          <div>
            <p className="font-medium text-zinc-900 dark:text-zinc-50">What is a hackathon?</p>
            <p className="mt-1">A hackathon is a focused sprint where developers, writers, and designers build something real from scratch — usually over a few weeks. Eigenthrope was conceived and built during an XRPL hackathon. Every transaction the game sends to the ledger carries a hackathon source tag, permanently linking it to the event that brought it into existence.</p>
          </div>

        </div>
      </div>
    </details>
  )
}
