import { PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { cellToTriggers, type Clue } from '@/lib/clues'

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0])
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseCSVLine(line)
    return Object.fromEntries(headers.map((h, i) => [h.trim(), values[i]?.trim() ?? '']))
  })
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

export async function POST(request: Request) {
  const text = await request.text()
  const rows = parseCSV(text)
  if (rows.length === 0) return Response.json({ error: 'No rows found' }, { status: 400 })

  const errors: string[] = []
  let imported = 0

  for (const row of rows) {
    const clue_id = row['clue_id']?.trim().toUpperCase()
    if (!clue_id) { errors.push(`Row missing clue_id`); continue }

    const clue: Clue = {
      clue_id,
      category: (row['category']?.trim() as Clue['category']) ?? 'behavioral',
      title: row['title']?.trim() ?? '',
      description: row['description']?.trim() ?? '',
      is_false_lead: row['is_false_lead']?.trim() === 'true',
      prerequisites: row['prerequisites']?.trim()
        ? row['prerequisites'].split(',').map(s => s.trim()).filter(Boolean)
        : [],
      reveal_triggers: cellToTriggers(row['reveal_triggers'] ?? ''),
      notes: row['notes']?.trim() ?? '',
      discovered: row['discovered']?.trim() === 'true',
      ...(row['discovered_at']?.trim() ? { discovered_at: row['discovered_at'].trim() } : {}),
      ...(row['discovered_in_universe']?.trim() ? { discovered_in_universe: row['discovered_in_universe'].trim() } : {}),
      ...(row['discovered_in_branch']?.trim() ? { discovered_in_branch: row['discovered_in_branch'].trim() } : {}),
    }

    try {
      await dynamo.send(new PutCommand({ TableName: 'eigenthrope_clues', Item: clue }))
      imported++
    } catch (err) {
      errors.push(`${clue_id}: ${(err as Error).message}`)
    }
  }

  return Response.json({ imported, errors })
}
