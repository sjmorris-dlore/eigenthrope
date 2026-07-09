import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { ScanCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { fetchStoryText, putStoryText } from '@/lib/s3'
import type { Clue } from '@/lib/clues'
import { triggersToCell } from '@/lib/clues'
import type { ChapterData } from '@/app/api/chapter/route'
import { BEHAVIORAL_TRAITS, emptyProfile, accumulateWeights } from '@/lib/behavioral'
import type { BehavioralProfile } from '@/lib/behavioral'

const CHAPTERS_TABLE = 'eigenthrope_chapters'
const UNIVERSES_TABLE = 'eigenthrope_universes'
const CLUES_TABLE = 'eigenthrope_clues'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, Accept',
  'Access-Control-Max-Age': '86400',
}

function unauthorized() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v)
  return new Response(response.body, { status: response.status, headers })
}

// The SDK requires Accept: application/json, text/event-stream.
// Claude.ai may omit this, so we inject it before passing to the transport.
function withRequiredAccept(request: Request): Request {
  const headers = new Headers(request.headers)
  headers.set('accept', 'application/json, text/event-stream')
  return new Request(request.url, {
    method: request.method,
    headers,
    body: request.body,
    duplex: 'half',
  } as RequestInit & { duplex: string })
}

function buildServer() {
  const server = new McpServer({ name: 'eigenthrope', version: '1.0.0' })

  // ── Clues ──────────────────────────────────────────────────────────────────

  server.tool(
    'list_clues',
    'List clues from the private clue library. Optionally filter by category, discovered status, or false-lead flag.',
    {
      category: z.enum(['behavioral', 'reality', 'host', 'notebook', 'emotional']).optional(),
      discovered: z.boolean().optional(),
      is_false_lead: z.boolean().optional(),
    },
    async ({ category, discovered, is_false_lead }) => {
      const result = await dynamo.send(new ScanCommand({ TableName: CLUES_TABLE }))
      let clues = (result.Items ?? []) as Clue[]
      if (category != null) clues = clues.filter(c => c.category === category)
      if (discovered != null) clues = clues.filter(c => c.discovered === discovered)
      if (is_false_lead != null) clues = clues.filter(c => c.is_false_lead === is_false_lead)
      clues.sort((a, b) => a.clue_id.localeCompare(b.clue_id))
      const summary = clues.map(c => ({
        clue_id: c.clue_id, category: c.category, title: c.title,
        discovered: c.discovered, is_false_lead: c.is_false_lead,
        prerequisites: c.prerequisites,
        reveal_triggers: triggersToCell(c.reveal_triggers ?? []),
        discovered_in_branch: c.discovered_in_branch,
      }))
      return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] }
    }
  )

  server.tool(
    'get_clue',
    'Get full details for a single clue including its description and notes.',
    { clue_id: z.string().describe('e.g. B1, E4') },
    async ({ clue_id }) => {
      const result = await dynamo.send(new GetCommand({ TableName: CLUES_TABLE, Key: { clue_id: clue_id.toUpperCase() } }))
      if (!result.Item) return { content: [{ type: 'text', text: `Clue ${clue_id} not found.` }] }
      return { content: [{ type: 'text', text: JSON.stringify(result.Item, null, 2) }] }
    }
  )

  server.tool(
    'create_clue',
    'Create a new clue in the library.',
    {
      clue_id: z.string().describe('Short ID like B1 or E4 — becomes the variable name for future if/then logic'),
      category: z.enum(['behavioral', 'reality', 'host', 'notebook', 'emotional']),
      title: z.string(),
      description: z.string().describe('Markdown'),
      is_false_lead: z.boolean().default(false),
      prerequisites: z.array(z.string()).default([]).describe('clue_ids that should be discovered first'),
      reveal_triggers: z.array(z.object({
        choice_point: z.string().describe('e.g. U001:E01:CP1'),
        winning_choice: z.string().describe('e.g. A or B'),
      })).default([]),
      notes: z.string().default(''),
    },
    async (input) => {
      const clue: Clue = {
        clue_id: input.clue_id.trim().toUpperCase(),
        category: input.category,
        title: input.title.trim(),
        description: input.description.trim(),
        is_false_lead: input.is_false_lead,
        discovered: false,
        prerequisites: input.prerequisites,
        reveal_triggers: input.reveal_triggers,
        notes: input.notes,
      }
      await dynamo.send(new PutCommand({ TableName: CLUES_TABLE, Item: clue }))
      return { content: [{ type: 'text', text: `Created clue ${clue.clue_id}.` }] }
    }
  )

  server.tool(
    'update_clue',
    'Update fields on an existing clue. Only provided fields are changed.',
    {
      clue_id: z.string(),
      title: z.string().optional(),
      description: z.string().optional().describe('Markdown — replaces the entire description'),
      is_false_lead: z.boolean().optional(),
      prerequisites: z.array(z.string()).optional(),
      reveal_triggers: z.array(z.object({ choice_point: z.string(), winning_choice: z.string() })).optional(),
      notes: z.string().optional(),
    },
    async (input) => {
      const existing = await dynamo.send(new GetCommand({ TableName: CLUES_TABLE, Key: { clue_id: input.clue_id.toUpperCase() } }))
      if (!existing.Item) return { content: [{ type: 'text', text: `Clue ${input.clue_id} not found.` }] }
      const updated: Clue = {
        ...(existing.Item as Clue),
        ...(input.title != null ? { title: input.title } : {}),
        ...(input.description != null ? { description: input.description } : {}),
        ...(input.is_false_lead != null ? { is_false_lead: input.is_false_lead } : {}),
        ...(input.prerequisites != null ? { prerequisites: input.prerequisites } : {}),
        ...(input.reveal_triggers != null ? { reveal_triggers: input.reveal_triggers } : {}),
        ...(input.notes != null ? { notes: input.notes } : {}),
      }
      await dynamo.send(new PutCommand({ TableName: CLUES_TABLE, Item: updated }))
      return { content: [{ type: 'text', text: `Updated clue ${updated.clue_id}.` }] }
    }
  )

  // ── Chapters & Story ────────────────────────────────────────────────────────

  server.tool(
    'create_episode',
    'Create a new episode in a universe with voting choices. Episode number is assigned automatically.',
    {
      universe_id: z.string().describe('e.g. U001'),
      chapter_label: z.string().describe('Display title, e.g. "Chapter 1 · The Star of Alexandria"'),
      prompt: z.string().describe('Internal admin prompt / narrative setup notes'),
      choices: z.record(
        z.string().describe('Choice ID: A, B, C, or D'),
        z.object({
          label: z.string(),
          description: z.string(),
          behavioral_weights: z.record(z.string(), z.number()).optional()
            .describe(`Trait weights for this choice, -5 to +5. Traits: ${BEHAVIORAL_TRAITS.join(', ')}`),
        })
      ).describe('At least 2 choices keyed by ID (A, B, C, D)'),
      voting_hours: z.number().default(24).describe('How long voting stays open in hours'),
    },
    async ({ universe_id, chapter_label, prompt, choices, voting_hours }) => {
      if (Object.keys(choices).length < 2) {
        return { content: [{ type: 'text', text: 'At least 2 choices required.' }] }
      }
      const existing = await dynamo.send(new ScanCommand({
        TableName: CHAPTERS_TABLE,
        FilterExpression: '#u = :uid',
        ExpressionAttributeNames: { '#u': 'universe' },
        ExpressionAttributeValues: { ':uid': universe_id.toUpperCase() },
        ProjectionExpression: 'chapter',
      }))
      const maxNum = (existing.Items ?? []).reduce((max, c) => {
        const n = parseInt((c['chapter'] as string).replace(/^[CE]/, '')) || 0
        return Math.max(max, n)
      }, 0)
      const chapter = `E${String(maxNum + 1).padStart(2, '0')}`
      const choice_point = `${universe_id.toUpperCase()}:${chapter}:CP1`
      const deadline = new Date(Date.now() + voting_hours * 60 * 60 * 1000).toISOString()
      await dynamo.send(new PutCommand({
        TableName: CHAPTERS_TABLE,
        Item: {
          choice_point, universe: universe_id.toUpperCase(), chapter,
          chapter_label: chapter_label.trim(), status: 'open',
          prompt: prompt.trim(), choices,
          voting_opens_at: new Date().toISOString(),
          voting_closes_at: deadline,
        },
      }))
      return { content: [{ type: 'text', text: `Created chapter ${choice_point} ("${chapter_label}") with ${Object.keys(choices).length} choices.` }] }
    }
  )

  server.tool(
    'update_episode_metadata',
    'Update an episode\'s label, prompt, choices, or voting deadline. Only provided fields are changed.',
    {
      choice_point: z.string().describe('e.g. U001:E01:CP1'),
      chapter_label: z.string().optional(),
      prompt: z.string().optional(),
      choices: z.record(z.string(), z.object({
        label: z.string(),
        description: z.string(),
        behavioral_weights: z.record(z.string(), z.number()).optional(),
      })).optional(),
      voting_closes_at: z.string().optional().describe('ISO 8601 datetime'),
    },
    async ({ choice_point, chapter_label, prompt, choices, voting_closes_at }) => {
      const setParts: string[] = []
      const names: Record<string, string> = {}
      const values: Record<string, unknown> = {}
      if (chapter_label != null) { setParts.push('chapter_label = :cl'); values[':cl'] = chapter_label }
      if (prompt != null) { setParts.push('#p = :prompt'); names['#p'] = 'prompt'; values[':prompt'] = prompt }
      if (choices != null) { setParts.push('choices = :choices'); values[':choices'] = choices }
      if (voting_closes_at != null) { setParts.push('voting_closes_at = :vca'); values[':vca'] = voting_closes_at }
      if (setParts.length === 0) return { content: [{ type: 'text', text: 'No fields provided to update.' }] }
      await dynamo.send(new UpdateCommand({
        TableName: CHAPTERS_TABLE, Key: { choice_point },
        UpdateExpression: `SET ${setParts.join(', ')}`,
        ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
        ExpressionAttributeValues: values,
      }))
      return { content: [{ type: 'text', text: `Updated chapter ${choice_point}.` }] }
    }
  )

  server.tool(
    'list_episodes',
    'List all episodes across all universes with their status and metadata.',
    { universe_id: z.string().optional().describe('Filter to a specific universe, e.g. U001') },
    async ({ universe_id }) => {
      const [chaptersResult, universesResult] = await Promise.all([
        dynamo.send(new ScanCommand({ TableName: CHAPTERS_TABLE })),
        dynamo.send(new ScanCommand({ TableName: UNIVERSES_TABLE })),
      ])
      const universeMap = Object.fromEntries(
        (universesResult.Items ?? []).map((u: Record<string, unknown>) => [u['universe_id'], u['title']])
      )
      let chapters = (chaptersResult.Items ?? []) as ChapterData[]
      if (universe_id) chapters = chapters.filter(c => c.choice_point.startsWith(universe_id))
      chapters.sort((a, b) => a.choice_point.localeCompare(b.choice_point))
      const summary = chapters.map(c => ({
        choice_point: c.choice_point,
        chapter_label: c.chapter_label,
        universe: universeMap[c.choice_point.split(':')[0]] ?? c.choice_point.split(':')[0],
        status: c.status,
        winning_choice: c.winning_choice ?? null,
        has_story: !!c.story_key,
        has_choice_intro: !!c.choice_intro_key,
        choices: Object.fromEntries(Object.entries(c.choices ?? {}).map(([k, v]) => [k, v.label])),
      }))
      return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] }
    }
  )

  server.tool(
    'get_episode_story',
    'Get an episode with all its story content: story text, choice intro, outcome texts, and epilogue.',
    { choice_point: z.string().describe('e.g. U001:E01:CP1') },
    async ({ choice_point }) => {
      const result = await dynamo.send(new GetCommand({ TableName: CHAPTERS_TABLE, Key: { choice_point } }))
      if (!result.Item) return { content: [{ type: 'text', text: `Chapter ${choice_point} not found.` }] }
      const chapter = result.Item as ChapterData
      const [storyText, choiceIntroText] = await Promise.all([
        chapter.story_key ? fetchStoryText(chapter.story_key) : Promise.resolve(null),
        chapter.choice_intro_key ? fetchStoryText(chapter.choice_intro_key) : Promise.resolve(null),
      ])
      const outcomeTexts: Record<string, string | null> = {}
      if (chapter.choice_outcomes) {
        await Promise.all(Object.entries(chapter.choice_outcomes).map(async ([id, key]) => {
          outcomeTexts[id] = await fetchStoryText(key)
        }))
      }
      const epilogueText = chapter.epilogue_key ? await fetchStoryText(chapter.epilogue_key) : null
      return {
        content: [{ type: 'text', text: JSON.stringify({
          choice_point, chapter_label: chapter.chapter_label, status: chapter.status,
          winning_choice: chapter.winning_choice ?? null, choices: chapter.choices,
          story_text: storyText ?? '(none)', choice_intro_text: choiceIntroText ?? '(none)',
          outcome_texts: outcomeTexts, epilogue_text: epilogueText ?? '(none)',
        }, null, 2) }],
      }
    }
  )

  server.tool(
    'update_episode_content',
    'Write story content for an episode. Type determines which section is updated.',
    {
      choice_point: z.string().describe('e.g. U001:E01:CP1'),
      type: z.enum(['story', 'choice_intro', 'choice_outcome', 'epilogue']),
      content: z.string().describe('Markdown text to save'),
      choice_id: z.string().optional().describe('Required when type is choice_outcome — e.g. A or B'),
    },
    async ({ choice_point, type, content, choice_id }) => {
      if (type === 'choice_outcome' && !choice_id) {
        return { content: [{ type: 'text', text: 'choice_id is required for choice_outcome.' }] }
      }
      const [universe, chapter] = choice_point.split(':')
      let s3Key: string
      if (type === 'story') s3Key = `${universe}/${chapter}/story.md`
      else if (type === 'choice_intro') s3Key = `${universe}/${chapter}/choice_intro.md`
      else if (type === 'epilogue') s3Key = `${universe}/${chapter}/epilogue.md`
      else s3Key = `${universe}/${chapter}/outcome_${choice_id}.md`
      await putStoryText(s3Key, content)
      if (type === 'story') {
        await dynamo.send(new UpdateCommand({ TableName: CHAPTERS_TABLE, Key: { choice_point }, UpdateExpression: 'SET story_key = :key', ExpressionAttributeValues: { ':key': s3Key } }))
      } else if (type === 'choice_intro') {
        await dynamo.send(new UpdateCommand({ TableName: CHAPTERS_TABLE, Key: { choice_point }, UpdateExpression: 'SET choice_intro_key = :key', ExpressionAttributeValues: { ':key': s3Key } }))
      } else if (type === 'epilogue') {
        await dynamo.send(new UpdateCommand({ TableName: CHAPTERS_TABLE, Key: { choice_point }, UpdateExpression: 'SET epilogue_key = :key', ExpressionAttributeValues: { ':key': s3Key } }))
      } else {
        const current = await dynamo.send(new GetCommand({ TableName: CHAPTERS_TABLE, Key: { choice_point } }))
        const existing = (current.Item?.choice_outcomes as Record<string, string>) ?? {}
        await dynamo.send(new UpdateCommand({ TableName: CHAPTERS_TABLE, Key: { choice_point }, UpdateExpression: 'SET choice_outcomes = :co', ExpressionAttributeValues: { ':co': { ...existing, [choice_id!]: s3Key } } }))
      }
      return { content: [{ type: 'text', text: `Saved ${type} for ${choice_point} → ${s3Key}` }] }
    }
  )

  server.tool(
    'get_behavioral_profile',
    'Get the Antagonist\'s accumulated behavioral profile of Observation — the running tally of trait weights from all closed chapter outcomes.',
    {},
    async () => {
      const result = await dynamo.send(new GetCommand({
        TableName: 'eigenthrope_config',
        Key: { key: 'behavioral_profile' },
      }))
      if (!result.Item?.value) {
        return { content: [{ type: 'text', text: 'No behavioral profile recorded yet. Profile accumulates as chapters close.' }] }
      }
      const profile = result.Item.value as Partial<BehavioralProfile>
      const sorted = BEHAVIORAL_TRAITS
        .map(t => ({ trait: t, value: profile[t] ?? 0 }))
        .filter(e => e.value !== 0)
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      const summary = sorted.length > 0
        ? sorted.map(e => `${e.value > 0 ? '+' : ''}${e.value}  ${e.trait}`).join('\n')
        : '(all traits at zero)'
      return { content: [{ type: 'text', text: `Behavioral Profile of Observation:\n\n${summary}` }] }
    }
  )

  server.tool(
    'delete_episode',
    'Permanently delete an episode and its tally record. Use with caution — this cannot be undone.',
    { choice_point: z.string().describe('e.g. U001:E01:CP1') },
    async ({ choice_point }) => {
      const existing = await dynamo.send(new GetCommand({ TableName: CHAPTERS_TABLE, Key: { choice_point } }))
      if (!existing.Item) {
        return { content: [{ type: 'text', text: `Episode ${choice_point} not found.` }] }
      }
      await Promise.all([
        dynamo.send(new DeleteCommand({ TableName: CHAPTERS_TABLE, Key: { choice_point } })),
        dynamo.send(new DeleteCommand({ TableName: 'eigenthrope_tallies', Key: { choice_point } })),
      ])
      return { content: [{ type: 'text', text: `Deleted episode ${choice_point}.` }] }
    }
  )

  server.tool(
    'set_behavioral_weights',
    'Manually apply trait weights to the behavioral profile. Accumulates on top of existing values unless replace=true.',
    {
      weights: z.record(z.string(), z.number()).describe(`Trait weights to apply. Valid traits: ${BEHAVIORAL_TRAITS.join(', ')}`),
      replace: z.boolean().default(false).describe('If true, replaces the entire profile instead of accumulating'),
    },
    async ({ weights, replace }) => {
      if (replace) {
        await dynamo.send(new PutCommand({
          TableName: 'eigenthrope_config',
          Item: { key: 'behavioral_profile', value: weights },
        }))
        return { content: [{ type: 'text', text: 'Profile replaced.' }] }
      }
      const existing = await dynamo.send(new GetCommand({
        TableName: 'eigenthrope_config',
        Key: { key: 'behavioral_profile' },
      }))
      const current = (existing.Item?.value ?? {}) as Partial<BehavioralProfile>
      const merged = accumulateWeights({ ...emptyProfile(), ...current }, weights)
      await dynamo.send(new PutCommand({
        TableName: 'eigenthrope_config',
        Item: { key: 'behavioral_profile', value: merged },
      }))
      return { content: [{ type: 'text', text: 'Profile updated.' }] }
    }
  )

  return server
}

type Params = { params: Promise<{ token: string }> }

function checkToken(token: string): boolean {
  const secret = process.env.MCP_SECRET
  return !!secret && token === secret
}

async function handle(request: Request, { params }: Params): Promise<Response> {
  const { token } = await params
  if (!checkToken(token)) return unauthorized()

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — new instance per request on serverless
    enableJsonResponse: true,
  })

  const server = buildServer()
  await server.connect(transport)
  const response = await transport.handleRequest(withRequiredAccept(request))
  return withCors(response)
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export const GET = handle
export const POST = handle
export const DELETE = handle
