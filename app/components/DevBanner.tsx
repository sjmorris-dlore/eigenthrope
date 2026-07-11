'use client'

import { useEffect, useState } from 'react'

const MSG = 'Under development · Please join in and send feedback, but be aware that the story will reset several times            '

export default function DevBanner() {
  const [testMode, setTestMode] = useState(false)

  useEffect(() => {
    fetch('/api/test-mode')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTestMode(Boolean(data.test_mode)) })
      .catch(() => {})
  }, [])

  return (
    // Height is always reserved (TopNav/mobile menu are positioned assuming
    // this bar exists) — only the content and color toggle with test mode,
    // so there's no layout shift when it turns on or off.
    <div className={`fixed inset-x-0 top-0 z-[60] h-8 overflow-hidden ${testMode ? 'bg-amber-400 dark:bg-amber-700' : ''}`}>
      {testMode && (
        <div
          className="flex h-full w-max items-center whitespace-nowrap"
          style={{ animation: 'marquee 25s linear infinite' }}
        >
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-900 dark:text-amber-100 px-12">
            {MSG}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-900 dark:text-amber-100 px-12">
            {MSG}
          </span>
        </div>
      )}
    </div>
  )
}
