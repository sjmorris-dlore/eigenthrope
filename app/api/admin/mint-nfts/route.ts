import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion } from '@/lib/config'
import { invokeAsync } from '@/lib/lambda'
import { winnerTaxon, participationTaxon } from '@/lib/resonance'
import type { ChapterData } from '@/app/api/chapter/route'

export async function POST(request: Request) {
  const { choice_point } = await request.json() as { choice_point: string }
  if (!choice_point) return Response.json({ error: 'choice_point required' }, { status: 400 })

  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
  if (!vaultAddress) return Response.json({ error: 'EIGENTHROPE_VAULT_ADDRESS not set' }, { status: 500 })

  const [chapterItem, resetVersion] = await Promise.all([
    dynamo.send(new GetCommand({ TableName: 'eigenthrope_chapters', Key: { choice_point } })),
    getResetVersion(),
  ])

  const chapter = chapterItem.Item as ChapterData | undefined
  if (!chapter) return Response.json({ error: 'Chapter not found' }, { status: 404 })
  if (chapter.status !== 'closed') return Response.json({ error: 'Chapter is not closed' }, { status: 409 })
  if (!chapter.winning_choice) return Response.json({ error: 'No winning choice recorded' }, { status: 409 })

  await invokeAsync('eigenthrope-mint-nfts', {
    choice_point,
    winning_choice: chapter.winning_choice,
    final_yield_pct: chapter.final_yield_pct ?? 0.18,
    winner_taxon: winnerTaxon(resetVersion),
    participation_taxon: participationTaxon(resetVersion),
    winner_nft_uri: chapter.winner_nft_uri ?? null,
    participation_nft_uri: chapter.participation_nft_uri ?? null,
    vault_address: vaultAddress,
    reset_version: resetVersion,
  })

  return Response.json({ ok: true, message: 'Minting started — check Lambda logs for progress.' }, { status: 202 })
}
