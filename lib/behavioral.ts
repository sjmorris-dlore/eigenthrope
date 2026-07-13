export const BEHAVIORAL_TRAITS = [
  'Curiosity',
  'Tolerance for Uncertainty',
  'Protectiveness',
  'Empathy',
  'Justice',
  'Forgiveness',
  'Loyalty',
  'Principle',
  'Hopefulness',
  'Autonomy',
  'Duty',
  'Risk Acceptance',
  'Resolve',
  'Self-Sacrifice',
] as const

export type BehavioralTrait = (typeof BEHAVIORAL_TRAITS)[number]
export type BehavioralWeights = Partial<Record<BehavioralTrait, number>>
export type BehavioralProfile = Record<BehavioralTrait, number>

export function emptyProfile(): BehavioralProfile {
  return Object.fromEntries(BEHAVIORAL_TRAITS.map(t => [t, 0])) as BehavioralProfile
}

export function accumulateWeights(profile: BehavioralProfile, weights: BehavioralWeights): BehavioralProfile {
  const result = { ...profile }
  for (const trait of BEHAVIORAL_TRAITS) {
    const w = weights[trait]
    if (w != null && w !== 0) result[trait] = (result[trait] ?? 0) + w
  }
  return result
}

/**
 * Public view of a chapter's choices: label and description ONLY. The
 * behavioral weights are the game's hidden scoring — they must never reach
 * a browser. Apply this to every choices object that leaves a public API
 * or gets passed into a client component.
 */
export function publicChoices(
  choices: Record<string, { label: string; description: string }> | undefined,
): Record<string, { label: string; description: string }> {
  return Object.fromEntries(
    Object.entries(choices ?? {}).map(([id, c]) => [id, { label: c.label, description: c.description }])
  )
}
