'use client'

import { useEffect, useState } from 'react'

export default function ChapterArtifact() {
  const [imageKey, setImageKey] = useState<string | null>(null)
  const [label, setLabel] = useState('')

  useEffect(() => {
    fetch('/api/chapter')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.participation_image_key) {
          setImageKey(data.participation_image_key)
          setLabel(data.chapter_label ?? '')
        }
      })
      .catch(() => null)
  }, [])

  if (!imageKey) return null

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="mb-3 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
        Observer Artifact
      </p>
      <div className="aspect-[9/16] w-full overflow-hidden rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/nft-image?key=${encodeURIComponent(imageKey)}`}
          alt={label ? `${label} observer artifact` : 'Observer artifact'}
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  )
}
