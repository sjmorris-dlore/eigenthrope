import Link from 'next/link'
import ThemeToggle from './ThemeToggle'

export default function TopNav() {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 flex h-12 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 sm:px-8 dark:border-zinc-800 dark:bg-black">
      <Link
        href="/archive"
        className="text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        Archive
      </Link>
      <ThemeToggle />
    </nav>
  )
}
