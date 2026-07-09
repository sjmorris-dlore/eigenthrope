'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ThemeToggle from './ThemeToggle'
import GameplayMenu from './GameplayMenu'
import { useEpisodeNav } from './EpisodeContext'
import RabbitHoleMenu from './RabbitHoleMenu'

const DISCORD_URL = process.env.NEXT_PUBLIC_DISCORD_URL

const navLink = 'text-xs uppercase tracking-widest text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
const activeNavLink = 'text-xs uppercase tracking-widest text-zinc-700 dark:text-zinc-200'

function AdminNav() {
  const pathname = usePathname()
  const links = [
    { href: '/admin', label: 'Episodes' },
    { href: '/admin/clues', label: 'Clues' },
  ]
  return (
    <>
      <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        Admin
      </span>
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={pathname === href ? activeNavLink : navLink}
        >
          {label}
        </Link>
      ))}
    </>
  )
}

function PlayerNav() {
  return (
    <>
      <Link
        href="/"
        className="text-xs font-bold uppercase tracking-widest text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
      >
        Eigenthrope
      </Link>
      <Link href="/archive" className={navLink}>Archive</Link>
      {DISCORD_URL && (
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className={navLink}>
          Discord
        </a>
      )}
      <GameplayMenu />
      <RabbitHoleMenu />
    </>
  )
}

function AuthorLink() {
  const { nav } = useEpisodeNav()
  if (!nav.authorLinkUrl) return null
  const label = nav.authorLinkLabel || (() => {
    try { return new URL(nav.authorLinkUrl!).hostname.replace(/^www\./, '') } catch { return nav.authorLinkUrl }
  })()
  return (
    <a
      href={nav.authorLinkUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={navLink}
    >
      {label}
    </a>
  )
}

export default function TopNav() {
  const pathname = usePathname()
  const isAdmin = pathname.startsWith('/admin')

  return (
    <nav className="fixed inset-x-0 top-0 z-50 flex h-12 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 sm:px-8 dark:border-zinc-800 dark:bg-black">
      <div className="flex items-center gap-6">
        {isAdmin ? <AdminNav /> : <PlayerNav />}
      </div>
      <div className="flex items-center gap-4">
        {!isAdmin && <AuthorLink />}
        <ThemeToggle />
      </div>
    </nav>
  )
}
