import Link from 'next/link'
import ThemeToggle from './ThemeToggle'
import GameplayMenu from './GameplayMenu'

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL

export default function TopNav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 flex h-12 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 sm:px-8 dark:border-zinc-800 dark:bg-black">
      <div className="flex items-center gap-6">
        <Link
          href="/"
          className="text-xs font-bold uppercase tracking-widest text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
        >
          Eigenthrope
        </Link>
        <Link
          href="/archive"
          className="text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Archive
        </Link>
        {DISCORD_URL && (
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Discord
          </a>
        )}
        <GameplayMenu />
      </div>
      <ThemeToggle />
    </nav>
  )
}
