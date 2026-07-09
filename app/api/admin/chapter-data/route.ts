import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const choicePoint = url.searchParams.get('choice_point')

  if (!choicePoint) {
    return Response.json({ error: 'choice_point is required' }, { status: 400 })
  }

  const result = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_chapters',
    Key: { choice_point: choicePoint },
  }))

  if (!result.Item) {
    return Response.json({ error: 'Chapter not found' }, { status: 404 })
  }

  return Response.json(result.Item)
}

export async function PATCH(request: Request) {
  const body = await request.json() as {
    choice_point: string
    chapter_label?: string
    choices?: Record<string, { label: string; description: string }>
    prompt?: string
    winner_nft_uri?: string
    participation_nft_uri?: string
    voting_closes_at?: string
    author_link_url?: string
    author_link_label?: string
  }

  const { choice_point, chapter_label, choices, prompt, winner_nft_uri, participation_nft_uri, voting_closes_at, author_link_url, author_link_label } = body

  if (!choice_point || (!choices && chapter_label === undefined && prompt === undefined && winner_nft_uri === undefined && participation_nft_uri === undefined && voting_closes_at === undefined && author_link_url === undefined && author_link_label === undefined)) {
    return Response.json({ error: 'choice_point and at least one field required' }, { status: 400 })
  }

  const setParts: string[] = []
  const names: Record<string, string> = {}
  const values: Record<string, unknown> = {}

  if (chapter_label !== undefined) {
    setParts.push('chapter_label = :cl')
    values[':cl'] = chapter_label
  }
  if (choices) {
    setParts.push('choices = :choices')
    values[':choices'] = choices
  }
  if (prompt !== undefined) {
    setParts.push('#p = :prompt')
    names['#p'] = 'prompt'
    values[':prompt'] = prompt
  }
  if (winner_nft_uri !== undefined) {
    setParts.push('winner_nft_uri = :wnuri')
    values[':wnuri'] = winner_nft_uri
  }
  if (participation_nft_uri !== undefined) {
    setParts.push('participation_nft_uri = :pnuri')
    values[':pnuri'] = participation_nft_uri
  }
  if (voting_closes_at !== undefined) {
    setParts.push('voting_closes_at = :vca')
    values[':vca'] = voting_closes_at
  }
  if (author_link_url !== undefined) {
    setParts.push('author_link_url = :alu')
    values[':alu'] = author_link_url
  }
  if (author_link_label !== undefined) {
    setParts.push('author_link_label = :all')
    values[':all'] = author_link_label
  }

  await dynamo.send(new UpdateCommand({
    TableName: 'eigenthrope_chapters',
    Key: { choice_point },
    UpdateExpression: `SET ${setParts.join(', ')}`,
    ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
    ExpressionAttributeValues: values,
  }))

  return Response.json({ ok: true })
}
