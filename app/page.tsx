import App from '@/app/components/App'
import ChapterTimer from '@/app/components/ChapterTimer'

function HowItWorks() {
  return (
    <details className="group w-full max-w-2xl rounded-xl border border-zinc-200 bg-white px-5 py-4 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-zinc-900 marker:hidden dark:text-zinc-50">
        <span>Gameplay</span>
        <span className="text-xs uppercase tracking-[0.2em] text-zinc-400 group-open:hidden">Show</span>
        <span className="hidden text-xs uppercase tracking-[0.2em] text-zinc-400 group-open:inline">Hide</span>
      </summary>

      <div className="mt-5 space-y-4 border-t border-zinc-100 pt-5 text-sm leading-6 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">1. Read the chapter</p>
          <p className="mt-1">Each chapter presents a moment where the community&apos;s choices shape what happens next in the story. Read, then connect your Xaman wallet to cast your observation.</p>
        </div>

        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">2. Vote</p>
          <p className="mt-1">Your vote is signed with your wallet and woven permanently into the XRP Ledger. It cannot be altered or erased.</p>
        </div>

        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">3. Earn an Observer Artifact</p>
          <p className="mt-1">
            When voting closes, observers who chose the winning option are eligible to receive an Observer Artifact — an NFT minted on the XRP Ledger.
            The number of artifacts minted depends on how contested the vote was: a close vote produces more artifacts, a landslide produces fewer.
            Voting with the crowd is safer, but a divided community rewards conviction.
          </p>
        </div>

        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">4. Build Resonance</p>
          <p className="mt-1">Each artifact you hold increases your Resonance — a measure of your accumulated influence in the story. Higher Resonance gives your future votes more weight.</p>
        </div>

        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-50">5. Trade</p>
          <p className="mt-1">Artifacts are standard XRP Ledger NFTs. You can hold them to build Resonance or trade them on any XRPL NFT marketplace.</p>
        </div>
      </div>
    </details>
  )
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 sm:px-8 dark:bg-black">
      <main className="flex w-full max-w-5xl flex-col items-center gap-12">
        <div className="flex w-full flex-col items-center gap-4 text-center">
          <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            EIGENTHROPE
          </h1>
          <p className="text-lg text-zinc-500 dark:text-zinc-400">
            A mystery the community uncovers.
          </p>
          <ChapterTimer />
        </div>

        <App />

        <HowItWorks />

        <div className="flex gap-4 text-sm text-zinc-400">
          <span>Universe 1</span>
          <span>·</span>
          <span>1960s</span>
          <span>·</span>
          <span>XRP Ledger</span>
        </div>
      </main>
    </div>
  )
}
