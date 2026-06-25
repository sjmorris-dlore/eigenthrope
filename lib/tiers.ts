export interface Tier {
  name: string
  min: number
}

export const TIERS: Tier[] = [
  { min: 35, name: 'Eigenthrope' },
  { min: 20, name: 'Chronicler' },
  { min: 10, name: 'Archivist' },
  { min: 5,  name: 'Investigator' },
  { min: 2,  name: 'Observer' },
  { min: 1,  name: 'Witness' },
]

export function getTier(resonance: number): string {
  for (const tier of TIERS) {
    if (resonance >= tier.min) return tier.name
  }
  return 'Witness'
}
