import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { emptyProfile, accumulateWeights } from '@/lib/behavioral'
import type { BehavioralWeights } from '@/lib/behavioral'

export async function GET() {
  const result = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_config',
    Key: { key: 'behavioral_profile' },
  }))
  return Response.json(result.Item?.value ?? {})
}

// PATCH: accumulate additional weights, or replace={true} to overwrite entirely
export async function PATCH(request: Request) {
  const body = await request.json() as { weights: BehavioralWeights; replace?: boolean }

  if (body.replace) {
    await dynamo.send(new PutCommand({
      TableName: 'eigenthrope_config',
      Item: { key: 'behavioral_profile', value: body.weights },
    }))
    return Response.json({ ok: true, profile: body.weights })
  }

  const existing = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_config',
    Key: { key: 'behavioral_profile' },
  }))
  const current = existing.Item?.value ?? {}
  const merged = accumulateWeights({ ...emptyProfile(), ...current }, body.weights)
  await dynamo.send(new PutCommand({
    TableName: 'eigenthrope_config',
    Item: { key: 'behavioral_profile', value: merged },
  }))
  return Response.json({ ok: true, profile: merged })
}
