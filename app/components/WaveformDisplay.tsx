'use client'

import { useState, useEffect, useRef, useMemo } from 'react'

const SVG_W = 300
const SVG_H = 150
const BASE_Y = SVG_H - 12
const CENTER_X = SVG_W / 2
const SIGMA_MIN = 18
const SIGMA_MAX = 88
const K = SIGMA_MIN * 120

export const MAX_YIELD = 0.25
export const MIN_YIELD = 0.05

export function computeYield(p: number): number {
  const t = Math.max(0, Math.min(1, (p - 0.5) * 2))
  return MIN_YIELD + (MAX_YIELD - MIN_YIELD) * (1 - t)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

// Builds area + stroke paths in one pass to halve Math.exp calls per frame
function buildPaths(sigma: number, amplitude: number, time: number) {
  const pts: string[] = []
  for (let i = 0; i <= 120; i++) {
    const x = (i / 120) * SVG_W
    const g = Math.exp(-0.5 * ((x - CENTER_X) / sigma) ** 2)
    // Shimmer: two sine waves along the surface, scaled by g so ripples fade at the edges
    const shimmer = (
      Math.sin(x * 0.13 + time * 0.0014) * 2.8 +
      Math.sin(x * 0.37 + time * 0.0021) * 1.3
    ) * g
    const y = Math.max(0, BASE_Y - amplitude * g - shimmer)
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  const stroke = 'M ' + pts.join(' L ')
  const area = `M 0,${BASE_Y} L ${pts.join(' L ')} L ${SVG_W},${BASE_Y} Z`
  return { area, stroke }
}

export default function WaveformDisplay() {
  const [p, setP] = useState(0.5)
  const [hasVotes, setHasVotes] = useState(false)

  useEffect(() => {
    const update = async () => {
      try {
        const res = await fetch('/api/tally')
        if (!res.ok) return
        const data = await res.json()
        const counts: Record<string, number> = data.counts ?? {}
        const total = Object.values(counts).reduce((a, b) => a + b, 0)
        if (total === 0) return
        const max = Math.max(...Object.values(counts))
        setP(max / total)
        setHasVotes(true)
      } catch { /* ignore */ }
    }
    update()
    const id = setInterval(update, 15000)
    return () => clearInterval(id)
  }, [])

  const t = Math.max(0, Math.min(1, (p - 0.5) * 2))
  const sigmaC = lerp(SIGMA_MAX, SIGMA_MIN, t)
  const sigmaY = lerp(SIGMA_MIN, SIGMA_MAX, t)
  const ampC = K / sigmaC
  const ampY = K / sigmaY
  const yieldPct = computeYield(p)

  // Initial static paths for first render — animation loop takes over immediately
  const init = useMemo(() => ({
    C: buildPaths(sigmaC, ampC, 0),
    Y: buildPaths(sigmaY, ampY, 0),
  }), [sigmaC, ampC, sigmaY, ampY])

  // Refs for direct DOM updates — bypasses React reconciliation for smooth 60fps
  const areaCRef = useRef<SVGPathElement>(null)
  const strokeCGlowRef = useRef<SVGPathElement>(null)
  const strokeCBrightRef = useRef<SVGPathElement>(null)
  const areaYRef = useRef<SVGPathElement>(null)
  const strokeYGlowRef = useRef<SVGPathElement>(null)
  const strokeYBrightRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    let animId: number
    const animate = (ts: number) => {
      // Two waves breathe with a ~4s period, offset by ~120° so they move independently
      const breatheC = 1 + Math.sin(ts * 0.00085) * 0.11
      const breatheY = 1 + Math.sin(ts * 0.00085 + 2.1) * 0.11

      const { area: aC, stroke: sC } = buildPaths(sigmaC, ampC * breatheC, ts)
      const { area: aY, stroke: sY } = buildPaths(sigmaY, ampY * breatheY, ts)

      areaCRef.current?.setAttribute('d', aC)
      strokeCGlowRef.current?.setAttribute('d', sC)
      strokeCBrightRef.current?.setAttribute('d', sC)
      areaYRef.current?.setAttribute('d', aY)
      strokeYGlowRef.current?.setAttribute('d', sY)
      strokeYBrightRef.current?.setAttribute('d', sY)

      animId = requestAnimationFrame(animate)
    }
    animId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animId)
  }, [sigmaC, ampC, sigmaY, ampY])

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
        Quantum State
      </p>

      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        width={SVG_W}
        height={SVG_H}
        className="w-full overflow-visible"
      >
        <line x1={0} y1={BASE_Y} x2={SVG_W} y2={BASE_Y}
          stroke="rgb(63,63,70)" strokeWidth={1} />

        {/* Yield wave — amber */}
        <path ref={areaYRef} d={init.Y.area} fill="rgba(251,191,36,0.06)" />
        <path ref={strokeYGlowRef} d={init.Y.stroke} fill="none" stroke="rgba(251,191,36,0.15)" strokeWidth={7} />
        <path ref={strokeYBrightRef} d={init.Y.stroke} fill="none" stroke="rgba(251,191,36,0.80)" strokeWidth={1.5} />

        {/* Certainty wave — white */}
        <path ref={areaCRef} d={init.C.area} fill="rgba(255,255,255,0.03)" />
        <path ref={strokeCGlowRef} d={init.C.stroke} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={7} />
        <path ref={strokeCBrightRef} d={init.C.stroke} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={1.5} />
      </svg>

      <div className="flex w-full justify-between text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-white/50" />
          Observer Consensus
        </span>
        <span className="flex items-center gap-1.5">
          Artifact Yield
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400/75" />
        </span>
      </div>

      {hasVotes ? (
        <p className="text-xs text-zinc-500">
          Yield:{' '}
          <span className="font-semibold text-zinc-300">{Math.round(yieldPct * 100)}%</span>
          {' '}of winners · consensus {Math.round(p * 100)}%
        </p>
      ) : (
        <p className="text-xs italic text-zinc-600">Awaiting observations</p>
      )}
    </div>
  )
}
