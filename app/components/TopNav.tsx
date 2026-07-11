'use client'

import Link from 'next/link'
import { useState } from 'react'
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
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      <nav className="fixed inset-x-0 top-8 z-50 flex h-12 items-center justify-between border-b border-zinc-200 bg-zinc-50 px-4 sm:px-8 dark:border-zinc-800 dark:bg-black">
        <div className="flex items-center gap-6">
          {isAdmin ? <AdminNav /> : (
            <>
              <Link
                href="/"
                className="text-xs font-bold uppercase tracking-widest text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
              >
                Eigenthrope
              </Link>
              <div className="hidden items-center gap-6 sm:flex">
                <Link href="/archive" className={navLink}>Archive</Link>
                <Link href="/wallet" className={navLink}>Artifacts</Link>
                {DISCORD_URL && (
                  <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className={navLink}>
                    Discord
                  </a>
                )}
                <GameplayMenu />
                <RabbitHoleMenu />
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-4">
          {!isAdmin && (
            <span className="hidden sm:block">
              <AuthorLink />
            </span>
          )}
          <ThemeToggle />
          {!isAdmin && (
            <button
              className="flex items-center justify-center text-lg text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 sm:hidden"
              onClick={() => setMobileOpen(o => !o)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? '✕' : '☰'}
            </button>
          )}
        </div>
      </nav>

      {!isAdmin && mobileOpen && (
        <div className="fixed inset-x-0 top-20 z-40 max-h-[calc(100vh-5rem)] overflow-y-auto border-b border-zinc-200 bg-zinc-50 sm:hidden dark:border-zinc-800 dark:bg-black">
          <div className="flex flex-col gap-3 p-4">
            <Link href="/archive" onClick={() => setMobileOpen(false)} className={navLink}>Archive</Link>
            <Link href="/wallet" onClick={() => setMobileOpen(false)} className={navLink}>Artifacts</Link>
            {DISCORD_URL && (
              <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)} className={navLink}>
                Discord
              </a>
            )}
            <AuthorLink />
            <GameplayMenu inline />
            <RabbitHoleMenu inline />
          </div>
        </div>
      )}
    </>
  )
}
