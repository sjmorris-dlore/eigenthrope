import { Client } from 'xrpl'
import { PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from './aws.js'
import { CONFIG_TABLE, SOURCE_TAG, XRPL_WSS, vaultAddress } from './config.js'
import { CHARACTERS, type CharacterDef } from './characters.js'
import { loadWallet } from './xrplVote.js'

const ARTIFACTS_TABLE = 'eigenthrope_artifacts'

interface ArtifactRecord {
  offer_id: string
  winner_address: string
  nft_token_id: string
  choice_point: string
  artifact_type: 'winner' | 'participation'
  status: string
  expires_at: string
}

/**
 * Publish each bot's wallet address to eigenthrope_config so the game side
 * (mint-nfts Lambda via the admin route, mint-expected) can keep bots out of
 * the winner-NFT tier when humans are in it. Called once at startup.
 */
export async function publishBotAddresses(addresses: Record<string, string>): Promise<void> {
  await dynamo.send(new PutCommand({
    TableName: CONFIG_TABLE,
    Item: { key: 'bot_addresses', value: addresses },
  }))
  console.log(`[artifacts] published bot addresses to config: ${Object.values(addresses).join(', ')}`)
}

/** All bot wallet addresses, derived fresh from Secrets Manager. */
async function botAddressSet(): Promise<Map<string, CharacterDef>> {
  const map = new Map<string, CharacterDef>()
  for (const character of CHARACTERS) {
    try {
      const wallet = await loadWallet(character)
      map.set(wallet.classicAddress, character)
    } catch (err) {
      console.error(`[artifacts] could not derive wallet for ${character.name}:`, err instanceof Error ? err.message : err)
    }
  }
  return map
}

/**
 * Defense-in-depth mirror of the mint-side rule: a bot may claim a winner
 * NFT only if every winner-type offer for that chapter went to a bot.
 * (The mint Lambda shouldn't create such offers when humans won, but this
 * also covers offers minted before that rule deployed.)
 */
async function winnerOffersAreAllBots(choicePoint: string, botAddresses: Set<string>): Promise<boolean> {
  const res = await dynamo.send(new ScanCommand({
    TableName: ARTIFACTS_TABLE,
    FilterExpression: 'choice_point = :cp AND artifact_type = :w',
    ExpressionAttributeValues: { ':cp': choicePoint, ':w': 'winner' },
    ProjectionExpression: 'winner_address',
  }))
  const winners = (res.Items ?? []) as { winner_address: string }[]
  return winners.length > 0 && winners.every(w => botAddresses.has(w.winner_address))
}

/**
 * Verify the sell offer on-ledger before accepting: it must still exist, be
 * owned by the vault, cost nothing, and be destined for this bot. These
 * checks are the security boundary — the artifacts table is trusted input,
 * but the ledger is the truth.
 */
async function verifyOfferOnLedger(
  client: Client,
  offerId: string,
  expectedDestination: string,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await client.request({
      command: 'ledger_entry',
      index: offerId,
      ledger_index: 'validated',
    })
    const node = res.result.node as unknown as Record<string, unknown> | undefined
    if (!node || node.LedgerEntryType !== 'NFTokenOffer') return { ok: false, reason: 'not an NFT offer' }
    if (node.Owner !== vaultAddress()) return { ok: false, reason: `owner is ${node.Owner}, not the vault` }
    if (node.Amount !== '0') return { ok: false, reason: `amount is ${JSON.stringify(node.Amount)}, not free` }
    if (node.Destination !== expectedDestination) return { ok: false, reason: 'destined to another account' }
    return { ok: true }
  } catch (err) {
    // entryNotFound => already claimed, cancelled, or expired on-ledger
    return { ok: false, reason: err instanceof Error ? err.message : 'ledger_entry failed' }
  }
}

/**
 * Claim pending NFT offers for all bots. Pure code — no model involvement —
 * so conversation can never influence what gets accepted. Winner NFTs are
 * only claimed when the chapter's entire winner list is bots.
 */
export async function claimPendingArtifacts(): Promise<void> {
  const bots = await botAddressSet()
  if (bots.size === 0) return
  const botAddresses = new Set(bots.keys())

  // Gather pending, unexpired offers across all bot addresses first;
  // only connect to XRPL if there's actually something to claim.
  const pending: { record: ArtifactRecord; character: CharacterDef }[] = []
  for (const [address, character] of bots) {
    try {
      const res = await dynamo.send(new QueryCommand({
        TableName: ARTIFACTS_TABLE,
        IndexName: 'winner_address-index',
        KeyConditionExpression: 'winner_address = :addr',
        FilterExpression: '#s = :pending',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':addr': address, ':pending': 'pending' },
      }))
      for (const item of (res.Items ?? []) as ArtifactRecord[]) {
        if (new Date(item.expires_at) <= new Date()) continue
        pending.push({ record: item, character })
      }
    } catch (err) {
      console.error(`[artifacts] offer query failed for ${character.name}:`, err)
    }
  }
  if (pending.length === 0) return

  console.log(`[artifacts] ${pending.length} pending offer(s) to evaluate`)
  const client = new Client(XRPL_WSS)
  await client.connect()
  try {
    for (const { record, character } of pending) {
      try {
        if (record.artifact_type === 'winner') {
          const allBots = await winnerOffersAreAllBots(record.choice_point, botAddresses)
          if (!allBots) {
            console.log(`[artifacts] ${character.name}: skipping winner NFT for ${record.choice_point} — humans are in the winner list`)
            continue
          }
        }

        const wallet = await loadWallet(character)
        const check = await verifyOfferOnLedger(client, record.offer_id, wallet.classicAddress)
        if (!check.ok) {
          console.log(`[artifacts] ${character.name}: skipping offer ${record.offer_id} — ${check.reason}`)
          continue
        }

        const result = await client.submitAndWait({
          TransactionType: 'NFTokenAcceptOffer',
          Account: wallet.classicAddress,
          NFTokenSellOffer: record.offer_id,
          SourceTag: SOURCE_TAG,
        }, { wallet })

        const engineResult = typeof result.result.meta === 'object' && result.result.meta !== null
          ? (result.result.meta as { TransactionResult?: string }).TransactionResult ?? 'unknown'
          : 'unknown'
        if (engineResult !== 'tesSUCCESS') {
          console.error(`[artifacts] ${character.name}: accept failed ${engineResult} (offer ${record.offer_id})`)
          continue
        }

        // Mirror /api/artifact/confirm so the claim UI and admin views agree
        await dynamo.send(new UpdateCommand({
          TableName: ARTIFACTS_TABLE,
          Key: { offer_id: record.offer_id },
          UpdateExpression: 'SET #s = :claimed, claimed_at = :now',
          ConditionExpression: '#s = :pending',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':claimed': 'claimed',
            ':pending': 'pending',
            ':now': new Date().toISOString(),
          },
        }))

        console.log(`[artifacts] ${character.name} claimed ${record.artifact_type} NFT for ${record.choice_point} (tx ${result.result.hash})`)
      } catch (err) {
        console.error(`[artifacts] ${character.name}: claim failed for offer ${record.offer_id}:`, err)
      }
    }
  } finally {
    await client.disconnect()
  }
}
