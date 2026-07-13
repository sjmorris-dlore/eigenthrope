import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from './dynamo'
import { getResetVersion } from './config'
import { getAliases } from './leaderboard'
import { fetchVaultTransactions } from './resonance'
import {
  buildChapterWeightsIndex, profileFromChoices, signatureGlyphPoints,
  walletChoicesFromTransactions,
} from './signature'

const XRPL_RPC = 'https://xrplcluster.com/'

export interface BazaarListing {
  offer_index: string
  nft_token_id: string
  choice_point: string
  chapter_label?: string
  artifact_type: 'winner' | 'participation'
  image_key?: string
  /** Price in drops (string, XRP-only offers) */
  amount_drops: string
  seller: string
  seller_alias?: string
  /** Seller's resonance signature — polygon points, nothing more */
  seller_glyph: string
}

interface MintRecord {
  nft_token_id: string
  choice_point: string
  artifact_type: 'winner' | 'participation'
}

interface SellOffer {
  nft_offer_index: string
  amount: unknown
  owner: string
  destination?: string
  flags: number
}

async function openSellOffers(nftId: string): Promise<SellOffer[]> {
  try {
    const res = await fetch(XRPL_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'nft_sell_offers',
        params: [{ nft_id: nftId, ledger_index: 'validated' }],
      }),
    })
    const data = await res.json()
    return (data.result?.offers ?? []) as SellOffer[]
  } catch {
    return []
  }
}

/**
 * The bazaar is a window, not a marketplace: it displays open on-ledger sell
 * offers for the game's artifacts. Only public XRP offers from players are
 * shown — vault-owned offers are the claim pipeline, and destination-locked
 * offers are private trades.
 */
export async function getBazaarListings(vaultAddress: string): Promise<BazaarListing[]> {
  const [mintScan, chapterScan, aliases, resetVersion, vaultTransactions] = await Promise.all([
    dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_minting',
      ProjectionExpression: 'nft_token_id, choice_point, artifact_type',
    })),
    dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_chapters',
      ProjectionExpression: 'choice_point, universe, chapter, chapter_label, winner_image_key, participation_image_key, choices',
    })),
    getAliases(),
    getResetVersion(),
    fetchVaultTransactions(vaultAddress, 400),
  ])
  const records = (mintScan.Items ?? []) as MintRecord[]
  if (records.length === 0) return []

  const chapterItems = (chapterScan.Items ?? []) as {
    choice_point: string
    chapter_label?: string
    winner_image_key?: string
    participation_image_key?: string
  }[]
  const chapterMeta = new Map(chapterItems.map(ch => [ch.choice_point, ch]))

  // Seller signatures: server-side fold of each seller's vote history
  const weightsIndex = buildChapterWeightsIndex(
    chapterItems as Parameters<typeof buildChapterWeightsIndex>[0]
  )
  const walletChoices = walletChoicesFromTransactions(vaultTransactions, resetVersion)
  const glyphFor = (account: string) =>
    signatureGlyphPoints(profileFromChoices(walletChoices.get(account), weightsIndex))

  const listings: BazaarListing[] = []
  await Promise.all(records.map(async (record) => {
    const offers = await openSellOffers(record.nft_token_id)
    for (const offer of offers) {
      if (offer.owner === vaultAddress) continue // claim pipeline, not a trade
      if (offer.destination) continue // private trade
      if (typeof offer.amount !== 'string') continue // IOU-priced — XRP only
      const meta = chapterMeta.get(record.choice_point)
      listings.push({
        offer_index: offer.nft_offer_index,
        nft_token_id: record.nft_token_id,
        choice_point: record.choice_point,
        chapter_label: meta?.chapter_label,
        artifact_type: record.artifact_type,
        image_key: record.artifact_type === 'winner' ? meta?.winner_image_key : meta?.participation_image_key,
        amount_drops: offer.amount,
        seller: offer.owner,
        seller_alias: aliases.get(offer.owner),
        seller_glyph: glyphFor(offer.owner),
      })
    }
  }))

  return listings.sort((a, b) =>
    Number(BigInt(a.amount_drops) - BigInt(b.amount_drops)) || a.choice_point.localeCompare(b.choice_point)
  )
}
