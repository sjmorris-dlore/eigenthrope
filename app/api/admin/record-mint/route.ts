import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion } from '@/lib/config'
import { invokeAsync } from '@/lib/lambda'
import { SEALS_TABLE, type SealRecord } from '@/lib/record'

/** Vindication artifacts sit alongside winner (1000+rv) / participation (2000+rv). */
const VINDICATION_TAXON_BASE = 3000

/**
 * Mint the vindication trophy for a judged seal. Single-shot: the seal is
 * stamped trophy_requested_at under a condition, so double-clicks and
 * concurrent admins can't mint twice. The Lambda mints from the vault and
 * creates the 0-drop claim offer; the existing artifact-claim UI picks it
 * up from eigenthrope_artifacts like any other award.
 */
export async function POST(request: Request) {
  const { seal_id } = await request.json().catch(() => ({})) as { seal_id?: string }
  if (!seal_id) return Response.json({ error: 'seal_id required' }, { status: 400 })

  const [item, uriItem, rv] = await Promise.all([
    dynamo.send(new GetCommand({ TableName: SEALS_TABLE, Key: { seal_id } })),
    dynamo.send(new GetCommand({ TableName: 'eigenthrope_config', Key: { key: 'vindication_nft_uri' } })),
    getResetVersion(),
  ])

  const seal = item.Item as SealRecord | undefined
  if (!seal) return Response.json({ error: 'Unknown seal' }, { status: 404 })
  if (seal.status !== 'vindicated') {
    return Response.json({ error: 'Only vindicated seals earn the trophy' }, { status: 409 })
  }
  if (seal.trophy_requested_at) {
    return Response.json({ error: `Trophy already requested at ${seal.trophy_requested_at}` }, { status: 409 })
  }

  const vindication = uriItem.Item?.value as { uri?: string } | undefined
  if (!vindication?.uri) {
    return Response.json({ error: 'Upload the Vindication Artifact artwork first' }, { status: 409 })
  }

  // Claim the single-shot slot BEFORE invoking, conditionally — if two admins
  // race, exactly one wins and the other gets a clean 409.
  try {
    await dynamo.send(new UpdateCommand({
      TableName: SEALS_TABLE,
      Key: { seal_id },
      UpdateExpression: 'SET trophy_requested_at = :now',
      ConditionExpression: 'attribute_not_exists(trophy_requested_at)',
      ExpressionAttributeValues: { ':now': new Date().toISOString() },
    }))
  } catch {
    return Response.json({ error: 'Trophy already requested' }, { status: 409 })
  }

  await invokeAsync('eigenthrope-mint-one', {
    destination_address: seal.account,
    nft_uri: vindication.uri,
    taxon: VINDICATION_TAXON_BASE + rv,
    artifact_type: 'vindication',
    reference: `RECORD:${seal_id}`,
  })

  return Response.json({
    ok: true,
    seal_id,
    taxon: VINDICATION_TAXON_BASE + rv,
    message: 'Trophy mint started — the claim offer will appear for the player shortly.',
  })
}
