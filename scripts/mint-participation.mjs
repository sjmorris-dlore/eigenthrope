/**
 * Usage:
 *   node scripts/mint-participation.mjs \
 *     --choice-point U001:C01:CP1 \
 *     --uri https://example.com/participation.png
 *
 * Mints a participation NFT (taxon 2) for every voter on the choice point,
 * regardless of which choice they voted for. Worth +1 resonance each.
 *
 * Requires in .env.local:
 *   EIGENTHROPE_VAULT_SECRET
 *   EIGENTHROPE_VAULT_ADDRESS
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 */

import { Client, Wallet } from 'xrpl'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import { config } from 'dotenv'

config({ path: '.env.local' })

const XRPL_WS = 'wss://xrplcluster.com/'
const PARTICIPATION_TAXON = 2
const SOURCE_TAG = 2606230005
const OFFER_EXPIRY_DAYS = 7

function getArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : null
}

const CHOICE_POINT = getArg('--choice-point')
const IMAGE_URI = getArg('--uri')

if (!CHOICE_POINT || !IMAGE_URI) {
  console.error('Usage: node scripts/mint-participation.mjs --choice-point U001:C01:CP1 --uri https://...')
  process.exit(1)
}

const vaultSecret = process.env.EIGENTHROPE_VAULT_SECRET
const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
if (!vaultSecret || !vaultAddress) {
  console.error('EIGENTHROPE_VAULT_SECRET and EIGENTHROPE_VAULT_ADDRESS must be set in .env.local')
  process.exit(1)
}

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
}))

function fromHex(hex) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

function toHex(str) {
  return Buffer.from(str, 'utf8').toString('hex').toUpperCase()
}

async function getAllVoters(client, vaultAddress, choicePoint) {
  const [universe, chapter, cp] = choicePoint.split(':')
  const res = await client.request({
    command: 'account_tx',
    account: vaultAddress,
    limit: 400,
  })

  const transactions = res.result?.transactions ?? []
  const latestVote = {}

  for (const entry of transactions) {
    const tx = entry.tx_json ?? entry.tx
    if (!tx || tx.TransactionType !== 'Payment') continue
    const sender = tx.Account?.trim()
    if (!sender || latestVote[sender]) continue

    const memos = tx.Memos
    if (!memos) continue

    for (const { Memo } of memos) {
      if (!Memo.MemoData) continue
      try {
        const vote = JSON.parse(fromHex(Memo.MemoData))
        if (vote.universe === universe && vote.chapter === chapter && vote.choice_point === cp) {
          latestVote[sender] = vote.choice
        }
      } catch { /* skip */ }
    }
  }

  return latestVote // { wallet: choiceId }
}

async function getOfferIdFromResult(result) {
  const nodes = result.result.meta?.AffectedNodes ?? []
  for (const node of nodes) {
    if (node.CreatedNode?.LedgerEntryType === 'NFTokenOffer') {
      return node.CreatedNode.LedgerIndex
    }
  }
  throw new Error('Could not find offer ID in transaction result')
}

const client = new Client(XRPL_WS)
await client.connect()

const wallet = Wallet.fromSeed(vaultSecret)
console.log(`Vault wallet: ${wallet.address}`)

const voterMap = await getAllVoters(client, vaultAddress, CHOICE_POINT)
const voters = Object.keys(voterMap)
console.log(`\nFound ${voters.length} voter(s) for ${CHOICE_POINT}`)

if (voters.length === 0) {
  console.error('No votes found for this choice point.')
  await client.disconnect()
  process.exit(1)
}

const uriHex = toHex(IMAGE_URI)
const expiresAt = new Date(Date.now() + OFFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

for (const voter of voters) {
  console.log(`\n  Minting participation NFT for ${voter} (voted: ${voterMap[voter]})...`)

  const mintResult = await client.submitAndWait({
    TransactionType: 'NFTokenMint',
    Account: wallet.address,
    URI: uriHex,
    Flags: 8, // tfTransferable
    NFTokenTaxon: PARTICIPATION_TAXON,
    SourceTag: SOURCE_TAG,
  }, { wallet })

  const nftTokenId = mintResult.result.meta?.nftoken_id
  if (!nftTokenId) {
    console.error(`  Failed to get NFTokenID for ${voter}, skipping`)
    continue
  }
  console.log(`  Minted: ${nftTokenId}`)

  const offerResult = await client.submitAndWait({
    TransactionType: 'NFTokenCreateOffer',
    Account: wallet.address,
    NFTokenID: nftTokenId,
    Amount: '0',
    Destination: voter,
    Flags: 1, // tfSellNFToken
    SourceTag: SOURCE_TAG,
  }, { wallet })

  const offerId = await getOfferIdFromResult(offerResult)
  console.log(`  Offer: ${offerId}`)

  await dynamo.send(new PutCommand({
    TableName: 'eigenthrope_artifacts',
    Item: {
      offer_id: offerId,
      nft_token_id: nftTokenId,
      artifact_type: 'participation',
      choice_point: CHOICE_POINT,
      winner_address: voter,
      voted_choice: voterMap[voter],
      nft_uri: IMAGE_URI,
      status: 'pending',
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    },
  }))
  console.log(`  Stored. Expires: ${expiresAt}`)
}

await client.disconnect()
console.log('\nDone.')
