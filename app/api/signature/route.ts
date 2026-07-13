import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion } from '@/lib/config'
import { fetchVaultTransactions } from '@/lib/resonance'
import { emptyProfile, type BehavioralProfile } from '@/lib/behavioral'
import {
  buildChapterWeightsIndex, profileFromChoices, signatureGlyphPoints,
  walletChoicesFromTransactions,
} from '@/lib/signature'

const ACCOUNT_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/

/**
 * Resonance signatures as SVG polygon points — the ONLY public projection of
 * the hidden behavioral profiles. `community` is the accumulated field;
 * `player` is the requesting wallet's own history (null when no account).
 */
export async function GET(request: Request) {
  const account = new URL(request.url).searchParams.get('account')?.trim()

  const profileItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_config',
    Key: { key: 'behavioral_profile' },
  }))
  const communityProfile = {
    ...emptyProfile(),
    ...((profileItem.Item?.value ?? {}) as Partial<BehavioralProfile>),
  }

  let player: string | null = null
  if (account && ACCOUNT_RE.test(account)) {
    const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
    if (vaultAddress) {
      const [resetVersion, transactions, chapterScan] = await Promise.all([
        getResetVersion(),
        fetchVaultTransactions(vaultAddress, 400),
        dynamo.send(new ScanCommand({
          TableName: 'eigenthrope_chapters',
          ProjectionExpression: 'choice_point, universe, chapter, choices',
        })),
      ])
      const weightsIndex = buildChapterWeightsIndex(
        (chapterScan.Items ?? []) as Parameters<typeof buildChapterWeightsIndex>[0]
      )
      const choices = walletChoicesFromTransactions(transactions, resetVersion).get(account)
      player = signatureGlyphPoints(profileFromChoices(choices, weightsIndex))
    }
  }

  return Response.json(
    { community: signatureGlyphPoints(communityProfile), player },
    { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } },
  )
}
