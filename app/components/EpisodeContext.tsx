'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

interface EpisodeNav {
  authorLinkUrl?: string
  authorLinkLabel?: string
}

const EpisodeContext = createContext<{
  nav: EpisodeNav
  setNav: (nav: EpisodeNav) => void
}>({ nav: {}, setNav: () => {} })

export function EpisodeProvider({ children }: { children: ReactNode }) {
  const [nav, setNav] = useState<EpisodeNav>({})
  return (
    <EpisodeContext.Provider value={{ nav, setNav }}>
      {children}
    </EpisodeContext.Provider>
  )
}

export function useEpisodeNav() {
  return useContext(EpisodeContext)
}
