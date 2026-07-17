import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'

/**
 * Bot pace multiplier (config key bot_pace). Applies on top of whichever
 * timing mode is active: post delays ×pace, idle frequency ÷pace.
 * 1 = normal, 2 = half as chatty, 0.5 = faster. The bots read it every
 * scheduler tick, so changes take effect within ~a minute — no redeploy.
 */
export async function GET() {
  const result = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_config',
    Key: { key: 'bot_pace' },
  }))
  const v = result.Item?.value
  return Response.json({ pace: typeof v === 'number' ? v : 1 })
}

export async function POST(request: Request) {
  const { pace } = await request.json().catch(() => ({})) as { pace?: number }
  if (typeof pace !== 'number' || !Number.isFinite(pace) || pace < 0.25 || pace > 10) {
    return Response.json({ error: 'pace must be a number between 0.25 and 10' }, { status: 400 })
  }
  await dynamo.send(new PutCommand({
    TableName: 'eigenthrope_config',
    Item: { key: 'bot_pace', value: pace, updated_at: new Date().toISOString() },
  }))
  return Response.json({ ok: true, pace })
}
