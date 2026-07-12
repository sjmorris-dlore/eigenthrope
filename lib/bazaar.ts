import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from './dynamo'
import { getAliases } from './leaderboard'

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
  const [mintScan, aliases] = await Promise.all([
    dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_minting',
      ProjectionExpression: 'nft_token_id, choice_point, artifact_type',
    })),
    getAliases(),
  ])
  const records = (mintScan.Items ?? []) as MintRecord[]
  if (records.length === 0) return []

  // Chapter labels + artifact image keys, fetched once per distinct chapter
  const chapterMeta = new Map<string, { label?: string; winner?: string; participation?: string }>()
  for (const cp of new Set(records.map(r => r.choice_point))) {
    try {
      const res = await dynamo.send(new GetCommand({
        TableName: 'eigenthrope_chapters',
        Key: { choice_point: cp },
        ProjectionExpression: 'chapter_label, winner_image_key, participation_image_key',
      }))
      chapterMeta.set(cp, {
        label: res.Item?.chapter_label as string | undefined,
        winner: res.Item?.winner_image_key as string | undefined,
        participation: res.Item?.participation_image_key as string | undefined,
      })
    } catch { chapterMeta.set(cp, {}) }
  }

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
        chapter_label: meta?.label,
        artifact_type: record.artifact_type,
        image_key: record.artifact_type === 'winner' ? meta?.winner : meta?.participation,
        amount_drops: offer.amount,
        seller: offer.owner,
        seller_alias: aliases.get(offer.owner),
      })
    }
  }))

  return listings.sort((a, b) =>
    Number(BigInt(a.amount_drops) - BigInt(b.amount_drops)) || a.choice_point.localeCompare(b.choice_point)
  )
}
