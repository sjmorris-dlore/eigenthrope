import { accumulateWeights, emptyProfile, type BehavioralProfile, type BehavioralTrait, type BehavioralWeights } from './behavioral'

// ─────────────────────────────────────────────────────────────────────────────
// Resonance signatures: each wallet's hidden behavioral profile rendered as a
// seven-pointed star — 14 vertices (7 spikes, 7 notches) for 14 traits.
// A wallet with no history is a perfectly regular star; every choice deforms it.
//
// SECRECY MODEL — the profile itself must never leave the server:
// - Only polygon coordinates are emitted; trait names/values are not.
// - The trait→vertex assignment below is a fixed SECRET permutation. It is
//   global (so similar profiles produce visibly similar stars — that's the
//   point) but undisclosed, and radii are quantized to 5 coarse steps, so
//   the mapping can't be inverted from pixels. Never expose this ordering
//   in any API response, client bundle, or public doc.
// ─────────────────────────────────────────────────────────────────────────────

const VERTEX_TRAITS: readonly BehavioralTrait[] = [
  'Duty',                       // outer 1
  'Hopefulness',                //  inner 1
  'Risk Acceptance',            // outer 2
  'Protectiveness',             //  inner 2
  'Curiosity',                  // outer 3
  'Self-Sacrifice',             //  inner 3
  'Justice',                    // outer 4
  'Tolerance for Uncertainty',  //  inner 4
  'Loyalty',                    // outer 5
  'Empathy',                    //  inner 5
  'Autonomy',                   // outer 6
  'Forgiveness',                //  inner 6
  'Resolve',                    // outer 7
  'Principle',                  //  inner 7
]

/** memo key "universe:chapter:cp" (STORED field values) → choice id → weights */
export type ChapterWeightsIndex = Record<string, Record<string, BehavioralWeights>>

interface ChapterRecordLite {
  choice_point: string
  universe?: string
  chapter?: string
  choices?: Record<string, { behavioral_weights?: BehavioralWeights }>
}

/** Index chapter choice-weights by the key vote memos actually carry. */
export function buildChapterWeightsIndex(chapters: ChapterRecordLite[]): ChapterWeightsIndex {
  const index: ChapterWeightsIndex = {}
  for (const ch of chapters) {
    const cp = ch.choice_point.split(':')[2]
    const universe = ch.universe ?? ch.choice_point.split(':')[0]
    const chapter = ch.chapter ?? ch.choice_point.split(':')[1]
    const byChoice: Record<string, BehavioralWeights> = {}
    for (const [id, c] of Object.entries(ch.choices ?? {})) {
      if (c.behavioral_weights) byChoice[id] = c.behavioral_weights
    }
    index[`${universe}:${chapter}:${cp}`] = byChoice
  }
  return index
}

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

/**
 * One pass over the vault's transactions (newest first): each wallet's latest
 * choice per chapter at the given reset version.
 */
export function walletChoicesFromTransactions(
  transactions: unknown[],
  resetVersion: number,
): Map<string, Map<string, string>> {
  const byWallet = new Map<string, Map<string, string>>()
  for (const entry of transactions) {
    const tx = (entry as Record<string, unknown>).tx_json ??
                (entry as Record<string, unknown>).tx
    if (!tx || (tx as Record<string, unknown>).TransactionType !== 'Payment') continue
    const sender = ((tx as Record<string, unknown>).Account as string)?.trim()
    if (!sender) continue
    const memos = (tx as Record<string, unknown>).Memos as Array<{ Memo: { MemoData?: string } }> | undefined
    for (const { Memo } of memos ?? []) {
      if (!Memo.MemoData) continue
      try {
        const vote = JSON.parse(fromHex(Memo.MemoData))
        if (!vote.universe || !vote.chapter || !vote.choice_point || !vote.choice) continue
        if ((vote.rv ?? 0) !== resetVersion) continue
        const chapterKey = `${vote.universe}:${vote.chapter}:${vote.choice_point}`
        let chapters = byWallet.get(sender)
        if (!chapters) { chapters = new Map(); byWallet.set(sender, chapters) }
        // newest-first: first occurrence per (wallet, chapter) is the latest vote
        if (!chapters.has(chapterKey)) chapters.set(chapterKey, vote.choice)
      } catch { /* malformed memo */ }
    }
  }
  return byWallet
}

/** Fold a wallet's chosen options into its hidden behavioral profile. */
export function profileFromChoices(
  choices: Map<string, string> | undefined,
  weightsIndex: ChapterWeightsIndex,
): BehavioralProfile {
  let profile = emptyProfile()
  for (const [chapterKey, choice] of choices ?? []) {
    const weights = weightsIndex[chapterKey]?.[choice]
    if (weights) profile = accumulateWeights(profile, weights)
  }
  return profile
}

// Geometry: viewBox 0 0 32 32, centered at 16. Outer spikes swing around 12,
// inner notches around 6 — quantized so scores can't be read back precisely.
const CENTER = 16
const OUTER_BASE = 12
const INNER_BASE = 6
const OUTER_STEP = 1.1
const INNER_STEP = 0.8
const QUANT_LEVELS = 2 // levels ∈ {-2..2} → 5 steps per vertex

function quantize(score: number): number {
  // tanh squashes unbounded accumulation; ×4 sets how fast a profile saturates
  return Math.round(Math.tanh(score / 4) * QUANT_LEVELS)
}

/**
 * The star silhouette as SVG polygon points. This string is the ONLY thing
 * about a profile that may leave the server.
 */
export function signatureGlyphPoints(profile: BehavioralProfile): string {
  const points: string[] = []
  for (let i = 0; i < VERTEX_TRAITS.length; i++) {
    const level = quantize(profile[VERTEX_TRAITS[i]] ?? 0)
    const outer = i % 2 === 0
    const radius = outer
      ? OUTER_BASE + level * OUTER_STEP
      : INNER_BASE + level * INNER_STEP
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / VERTEX_TRAITS.length
    const x = CENTER + radius * Math.cos(angle)
    const y = CENTER + radius * Math.sin(angle)
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  }
  return points.join(' ')
}
