export interface RevealTrigger {
  choice_point: string
  winning_choice: string
}

export interface Clue {
  clue_id: string
  category: 'behavioral' | 'reality' | 'host' | 'notebook' | 'emotional'
  title: string
  description: string
  is_false_lead: boolean
  discovered: boolean
  discovered_at?: string
  discovered_in_universe?: string
  discovered_in_branch?: string
  prerequisites: string[]      // clue_ids
  reveal_triggers: RevealTrigger[]
  notes: string
}

// CSV serialization helpers
export function triggersToCell(triggers: RevealTrigger[]): string {
  return triggers.map(t => `${t.choice_point}/${t.winning_choice}`).join(',')
}

export function cellToTriggers(cell: string): RevealTrigger[] {
  if (!cell.trim()) return []
  return cell.split(',').map(s => {
    const lastSlash = s.trim().lastIndexOf('/')
    return {
      choice_point: s.trim().slice(0, lastSlash),
      winning_choice: s.trim().slice(lastSlash + 1),
    }
  })
}

export const CSV_HEADERS = [
  'clue_id', 'category', 'title', 'description',
  'is_false_lead', 'prerequisites', 'reveal_triggers', 'notes',
  'discovered', 'discovered_at', 'discovered_in_universe', 'discovered_in_branch',
]
