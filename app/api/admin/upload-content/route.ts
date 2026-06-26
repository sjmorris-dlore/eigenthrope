import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { putStoryText } from '@/lib/s3'

export async function POST(request: Request) {
  const { choice_point, type, content, choice_id } = await request.json() as {
    choice_point: string
    type: 'story' | 'choice_intro' | 'choice_outcome' | 'epilogue'
    content: string
    choice_id?: string
  }

  if (!choice_point || !type || !content) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const [universe, chapter] = choice_point.split(':')

  let s3Key: string
  if (type === 'story') {
    s3Key = `${universe}/${chapter}/story.md`
  } else if (type === 'choice_intro') {
    s3Key = `${universe}/${chapter}/choice_intro.md`
  } else if (type === 'epilogue') {
    s3Key = `${universe}/${chapter}/epilogue.md`
  } else if (type === 'choice_outcome') {
    if (!choice_id) return Response.json({ error: 'choice_id required for choice_outcome' }, { status: 400 })
    s3Key = `${universe}/${chapter}/outcome_${choice_id}.md`
  } else {
    return Response.json({ error: 'Invalid type' }, { status: 400 })
  }

  await putStoryText(s3Key, content)

  if (type === 'story') {
    await dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_chapters',
      Key: { choice_point },
      UpdateExpression: 'SET story_key = :key',
      ExpressionAttributeValues: { ':key': s3Key },
    }))
  } else if (type === 'choice_intro') {
    await dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_chapters',
      Key: { choice_point },
      UpdateExpression: 'SET choice_intro_key = :key',
      ExpressionAttributeValues: { ':key': s3Key },
    }))
  } else if (type === 'epilogue') {
    await dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_chapters',
      Key: { choice_point },
      UpdateExpression: 'SET epilogue_key = :key',
      ExpressionAttributeValues: { ':key': s3Key },
    }))
  } else {
    // Merge into choice_outcomes map with a read-modify-write
    const current = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_chapters',
      Key: { choice_point },
    }))
    const existing = (current.Item?.choice_outcomes as Record<string, string>) ?? {}
    await dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_chapters',
      Key: { choice_point },
      UpdateExpression: 'SET choice_outcomes = :co',
      ExpressionAttributeValues: { ':co': { ...existing, [choice_id!]: s3Key } },
    }))
  }

  return Response.json({ ok: true, s3_key: s3Key })
}
