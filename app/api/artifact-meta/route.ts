import { BatchGetCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'

export interface ArtifactMeta {
  choice_point: string
  chapter_label?: string
  artifact_type: 'winner' | 'participation'
  image_key?: string
  winning_choice?: string
}

/**
 * Game-side metadata for held artifacts, keyed by NFT token id: which
 * chapter, which type, and the artifact image. Public — it describes
 * publicly-visible NFTs. Tokens without a minting record (pre-reset
 * artifacts) simply aren't in the response; callers fall back to the
 * NFT's own URI metadata.
 */
export async function GET(request: Request) {
  const idsParam = new URL(request.url).searchParams.get('ids') ?? ''
  const ids = [...new Set(idsParam.split(',').map(s => s.trim()).filter(Boolean))].slice(0, 50)
  if (ids.length === 0) {
    return Response.json({ error: 'ids required (comma-separated NFT token ids)' }, { status: 400 })
  }

  const meta: Record<string, ArtifactMeta> = {}
  try {
    const res = await dynamo.send(new BatchGetCommand({
      RequestItems: {
        eigenthrope_minting: {
          Keys: ids.map(id => ({ nft_token_id: id })),
          ProjectionExpression: 'nft_token_id, choice_point, artifact_type, winning_choice',
        },
      },
    }))
    const records = (res.Responses?.eigenthrope_minting ?? []) as {
      nft_token_id: string
      choice_point: string
      artifact_type: 'winner' | 'participation'
      winning_choice?: string
    }[]

    // Chapter labels + image keys, one read per distinct chapter
    const chapters = new Map<string, { label?: string; winner?: string; participation?: string }>()
    for (const cp of new Set(records.map(r => r.choice_point))) {
      try {
        const ch = await dynamo.send(new GetCommand({
          TableName: 'eigenthrope_chapters',
          Key: { choice_point: cp },
          ProjectionExpression: 'chapter_label, winner_image_key, participation_image_key',
        }))
        chapters.set(cp, {
          label: ch.Item?.chapter_label as string | undefined,
          winner: ch.Item?.winner_image_key as string | undefined,
          participation: ch.Item?.participation_image_key as string | undefined,
        })
      } catch { chapters.set(cp, {}) }
    }

    for (const r of records) {
      const ch = chapters.get(r.choice_point)
      meta[r.nft_token_id] = {
        choice_point: r.choice_point,
        chapter_label: ch?.label,
        artifact_type: r.artifact_type,
        image_key: r.artifact_type === 'winner' ? ch?.winner : ch?.participation,
        winning_choice: r.winning_choice,
      }
    }
  } catch {
    // fall through with whatever was resolved — callers have URI fallback
  }

  return Response.json(
    { meta },
    { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } },
  )
}
