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

function buildPaths(sigma: number, amplitude: number, time: number) {
  const pts: string[] = []
  for (let i = 0; i <= 120; i++) {
    const x = (i / 120) * SVG_W
    const g = Math.exp(-0.5 * ((x - CENTER_X) / sigma) ** 2)
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

const COLORS = {
  dark: {
    baseline:  'rgb(63,63,70)',
    certainty: { area: 'rgba(255,255,255,0.03)', glow: 'rgba(255,255,255,0.10)', bright: 'rgba(255,255,255,0.55)' },
    yield:     { area: 'rgba(251,191,36,0.06)',  glow: 'rgba(251,191,36,0.15)',  bright: 'rgba(251,191,36,0.80)' },
  },
  light: {
    baseline:  'rgb(212,212,216)',
    certainty: { area: 'rgba(63,63,70,0.05)',  glow: 'rgba(63,63,70,0.12)',  bright: 'rgba(63,63,70,0.65)'  },
    yield:     { area: 'rgba(180,83,9,0.05)',  glow: 'rgba(180,83,9,0.15)',  bright: 'rgba(180,83,9,0.80)'  },
  },
}

export default function WaveformDisplay() {
  const [p, setP] = useState(0.5)
  const [hasVotes, setHasVotes] = useState(false)
  const [isDark, setIsDark] = useState(false)

  // Watch for .dark class changes on <html>
  useEffect(() => {
    const el = document.documentElement
    const check = () => setIsDark(el.classList.contains('dark'))
    check()
    const observer = new MutationObserver(check)
    observer.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  // Tally polling
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

  const init = useMemo(() => ({
    C: buildPaths(sigmaC, ampC, 0),
    Y: buildPaths(sigmaY, ampY, 0),
  }), [sigmaC, ampC, sigmaY, ampY])

  // Path refs for animation loop
  const areaCRef        = useRef<SVGPathElement>(null)
  const strokeCGlowRef  = useRef<SVGPathElement>(null)
  const strokeCBrightRef = useRef<SVGPathElement>(null)
  const areaYRef        = useRef<SVGPathElement>(null)
  const strokeYGlowRef  = useRef<SVGPathElement>(null)
  const strokeYBrightRef = useRef<SVGPathElement>(null)
  const baselineRef     = useRef<SVGLineElement>(null)

  // Update SVG colors when theme flips
  useEffect(() => {
    const c = isDark ? COLORS.dark : COLORS.light
    baselineRef.current?.setAttribute('stroke', c.baseline)
    areaCRef.current?.setAttribute('fill', c.certainty.area)
    strokeCGlowRef.current?.setAttribute('stroke', c.certainty.glow)
    strokeCBrightRef.current?.setAttribute('stroke', c.certainty.bright)
    areaYRef.current?.setAttribute('fill', c.yield.area)
    strokeYGlowRef.current?.setAttribute('stroke', c.yield.glow)
    strokeYBrightRef.current?.setAttribute('stroke', c.yield.bright)
  }, [isDark])

  // Animation loop — bypasses React for smooth 60fps
  useEffect(() => {
    let animId: number
    const animate = (ts: number) => {
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

  const c = isDark ? COLORS.dark : COLORS.light

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-0 dark:bg-zinc-950 dark:shadow-none">
      <div className="flex flex-col items-center gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-300">
          Quantum State
        </p>

        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width={SVG_W} height={SVG_H} className="w-full overflow-visible">
          <line ref={baselineRef} x1={0} y1={BASE_Y} x2={SVG_W} y2={BASE_Y}
            stroke={c.baseline} strokeWidth={1} />

          {/* Yield wave — amber / amber-700 */}
          <path ref={areaYRef}        d={init.Y.area}   fill={c.yield.area} />
          <path ref={strokeYGlowRef}  d={init.Y.stroke} fill="none" stroke={c.yield.glow}   strokeWidth={7} />
          <path ref={strokeYBrightRef} d={init.Y.stroke} fill="none" stroke={c.yield.bright} strokeWidth={1.5} />

          {/* Certainty wave — white / zinc */}
          <path ref={areaCRef}        d={init.C.area}   fill={c.certainty.area} />
          <path ref={strokeCGlowRef}  d={init.C.stroke} fill="none" stroke={c.certainty.glow}   strokeWidth={7} />
          <path ref={strokeCBrightRef} d={init.C.stroke} fill="none" stroke={c.certainty.bright} strokeWidth={1.5} />
        </svg>

        <div className="flex w-full justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-white/50" />
            Observer Consensus
          </span>
          <span className="flex items-center gap-1.5">
            Artifact Yield
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-600/75 dark:bg-amber-400/75" />
          </span>
        </div>

        {hasVotes ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Yield:{' '}
            <span className="font-semibold text-zinc-700 dark:text-zinc-200">{Math.round(yieldPct * 100)}%</span>
            {' '}of winners · consensus {Math.round(p * 100)}%
          </p>
        ) : (
          <p className="text-xs italic text-zinc-400 dark:text-zinc-500">Awaiting observations</p>
        )}
      </div>
    </div>
  )
}
