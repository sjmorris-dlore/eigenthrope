import App from '@/app/components/App'

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 p-8 dark:bg-black">
      <main className="flex w-full max-w-lg flex-col items-center gap-12 text-center">
        <div className="flex flex-col items-center gap-4">
          <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            EIGENTHROPE
          </h1>
          <p className="text-lg text-zinc-500 dark:text-zinc-400">
            A collaborative mystery across collapsing universes
          </p>
        </div>

        <App />

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
