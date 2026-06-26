import App from '@/app/components/App'
import ThemeToggle from '@/app/components/ThemeToggle'

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-10 sm:px-8 dark:bg-black">
      <main className="flex w-full max-w-5xl flex-col items-center gap-12">
        <div className="relative flex w-full flex-col items-center gap-4 text-center">
          <h1 className="text-5xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            EIGENTHROPE
          </h1>
          <p className="text-lg text-zinc-500 dark:text-zinc-400">
            A mystery the community uncovers.
          </p>
          <div className="absolute right-0 top-0">
            <ThemeToggle />
          </div>
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
