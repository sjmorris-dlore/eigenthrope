/**
 * Usage:
 *   node scripts/mint-artifact.mjs \
 *     --choice-point U001:C01:CP1 \
 *     --uri https://example.com/artifact.png
 *
 * Mints winner NFTs (taxon = 1000 + reset_version) for a percentage of winners.
 * Quantum Yield: 50/50 split → 25% of winners; 100/0 split → 5% of winners.
 *
 * Requires in .env.local:
 *   EIGENTHROPE_VAULT_SECRET
 *   EIGENTHROPE_VAULT_ADDRESS
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
 */

import { Client, Wallet } from 'xrpl'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { config } from 'dotenv'

config({ path: '.env.local' })

const XRPL_WS = 'wss://xrplcluster.com/'
const WINNER_TAXON_BASE = 1000
const SOURCE_TAG = 2606230005
const MAX_YIELD = 0.25
const MIN_YIELD = 0.05
const OFFER_EXPIRY_DAYS = 7

function getArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : null
}

const CHOICE_POINT = getArg('--choice-point')
const IMAGE_URI    = getArg('--uri')

if (!CHOICE_POINT || !IMAGE_URI) {
  console.error('Usage: node scripts/mint-artifact.mjs --choice-point U001:C01:CP1 --uri https://...')
  process.exit(1)
}

const vaultSecret  = process.env.EIGENTHROPE_VAULT_SECRET
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

async function getResetVersion() {
  try {
    const result = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'reset_version' },
    }))
    const v = result.Item?.value
    return typeof v === 'number' ? v : 0
  } catch { return 0 }
}

function fromHex(hex) { return Buffer.from(hex, 'hex').toString('utf8') }
function toHex(str)   { return Buffer.from(str, 'utf8').toString('hex').toUpperCase() }

function computeYield(p) {
  const t = Math.max(0, Math.min(1, (p - 0.5) * 2))
  return MIN_YIELD + (MAX_YIELD - MIN_YIELD) * (1 - t)
}

async function getVotersByChoice(client, vaultAddress, choicePoint, resetVersion) {
  const [universe, chapter, cp] = choicePoint.split(':')
  const res = await client.request({ command: 'account_tx', account: vaultAddress, limit: 400, forward: false })
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
        if (
          vote.universe === universe &&
          vote.chapter === chapter &&
          vote.choice_point === cp &&
          (vote.rv ?? 0) === resetVersion
        ) {
          latestVote[sender] = { choice: vote.choice, weight: vote.weight ?? 1 }
        }
      } catch { /* skip */ }
    }
  }

  const byChoice = {}
  for (const [wallet, { choice, weight }] of Object.entries(latestVote)) {
    if (!byChoice[choice]) byChoice[choice] = { wallets: [], totalWeight: 0 }
    byChoice[choice].wallets.push(wallet)
    byChoice[choice].totalWeight += weight
  }
  return byChoice
}

function randomSubset(arr, pct) {
  if (arr.length === 0) return []
  const count = Math.max(1, Math.floor(arr.length * pct))
  return [...arr].sort(() => Math.random() - 0.5).slice(0, count)
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

const resetVersion = await getResetVersion()
const WINNER_TAXON = WINNER_TAXON_BASE + resetVersion
console.log(`Reset version: ${resetVersion}  →  Winner taxon: ${WINNER_TAXON}`)

const client = new Client(XRPL_WS)
await client.connect()

const wallet = Wallet.fromSeed(vaultSecret)
console.log(`Vault wallet: ${wallet.address}`)

const byChoice = await getVotersByChoice(client, vaultAddress, CHOICE_POINT, resetVersion)
console.log('\nVoters by choice (reset ' + resetVersion + '):')
for (const [choice, { wallets, totalWeight }] of Object.entries(byChoice)) {
  console.log(`  ${choice}: ${wallets.length} voter(s), weight ${totalWeight.toFixed(2)}`)
}

if (Object.keys(byChoice).length === 0) {
  console.error('No votes found for this choice point and reset version.')
  await client.disconnect()
  process.exit(1)
}

const winningChoice = Object.entries(byChoice).sort((a, b) => b[1].totalWeight - a[1].totalWeight)[0][0]
const { wallets: winners, totalWeight: winnerWeight } = byChoice[winningChoice]
const totalWeight = Object.values(byChoice).reduce((s, v) => s + v.totalWeight, 0)
const p = winnerWeight / totalWeight
const yieldPct = computeYield(p)

const rawCount = Math.floor(winners.length * yieldPct)
const selectedCount = Math.max(1, rawCount)
const guaranteedFloor = rawCount < 1

console.log(`\nWinning choice: ${winningChoice} (${Math.round(p * 100)}% consensus)`)
console.log(`Quantum yield: ${Math.round(yieldPct * 100)}% → ${selectedCount} of ${winners.length} winner(s)${guaranteedFloor ? ' (floor: at least 1 always minted)' : ''}`)

const selected = randomSubset(winners, yieldPct)
console.log(`Minting for ${selected.length} of ${winners.length} winners:\n`)

const uriHex   = toHex(IMAGE_URI)
const expiresAt = new Date(Date.now() + OFFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

for (const winner of selected) {
  console.log(`  Minting for ${winner}...`)

  const mintResult = await client.submitAndWait({
    TransactionType: 'NFTokenMint',
    Account: wallet.address,
    URI: uriHex,
    Flags: 8,
    NFTokenTaxon: WINNER_TAXON,
    SourceTag: SOURCE_TAG,
  }, { wallet })

  const nftTokenId = mintResult.result.meta?.nftoken_id
  if (!nftTokenId) { console.error(`  Failed to get NFTokenID for ${winner}, skipping`); continue }
  console.log(`  Minted: ${nftTokenId}`)

  const offerResult = await client.submitAndWait({
    TransactionType: 'NFTokenCreateOffer',
    Account: wallet.address,
    NFTokenID: nftTokenId,
    Amount: '0',
    Destination: winner,
    Flags: 1,
    SourceTag: SOURCE_TAG,
  }, { wallet })

  const offerId = await getOfferIdFromResult(offerResult)
  console.log(`  Offer: ${offerId}`)

  await dynamo.send(new PutCommand({
    TableName: 'eigenthrope_artifacts',
    Item: {
      offer_id: offerId,
      nft_token_id: nftTokenId,
      reset_version: resetVersion,
      nft_taxon: WINNER_TAXON,
      choice_point: CHOICE_POINT,
      winner_address: winner,
      winning_choice: winningChoice,
      nft_uri: IMAGE_URI,
      status: 'pending',
      expires_at: expiresAt,
      created_at: new Date().toISOString(),
    },
  }))
  console.log(`  Stored. Expires: ${expiresAt}\n`)
}

await client.disconnect()
console.log('Done.')
