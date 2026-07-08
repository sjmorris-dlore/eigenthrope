import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { CSV_HEADERS, triggersToCell, type Clue } from '@/lib/clues'

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export async function GET() {
  const result = await dynamo.send(new ScanCommand({ TableName: 'eigenthrope_clues' }))
  const clues = ((result.Items ?? []) as Clue[]).sort((a, b) => a.clue_id.localeCompare(b.clue_id))

  const rows = [
    CSV_HEADERS.join(','),
    ...clues.map(c => [
      csvCell(c.clue_id),
      csvCell(c.category),
      csvCell(c.title),
      csvCell(c.description),
      csvCell(c.is_false_lead ? 'true' : 'false'),
      csvCell((c.prerequisites ?? []).join(',')),
      csvCell(triggersToCell(c.reveal_triggers ?? [])),
      csvCell(c.notes),
      csvCell(c.discovered ? 'true' : 'false'),
      csvCell(c.discovered_at ?? ''),
      csvCell(c.discovered_in_universe ?? ''),
      csvCell(c.discovered_in_branch ?? ''),
    ].join(',')),
  ]

  return new Response(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="eigenthrope-clues-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
