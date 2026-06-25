/**
 * Manually closes the active choice point immediately, regardless of deadline.
 * Use when you want to end voting early.
 *
 * Usage: node scripts/close-choice-point.mjs
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { config } from 'dotenv'

config({ path: '.env.local' })

const XRPL_RPC = 'https://xrplcluster.com/'
const MIN_YIELD = 0.05
const MAX_YIELD = 0.25

function computeYield(p) {
  const t = Math.max(0, Math.min(1, (p - 0.5) * 2))
  return MIN_YIELD + (MAX_YIELD - MIN_YIELD) * (1 - t)
}

function fromHex(hex) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
}))

const configItem = await dynamo.send(new GetCommand({
  TableName: 'eigenthrope_config',
  Key: { key: 'active_choice_point' },
}))
if (!configItem.Item) { console.error('No active choice point.'); process.exit(1) }

const choicePoint = configItem.Item.value
const [universe, chapter, cp] = choicePoint.split(':')

const chapterItem = await dynamo.send(new GetCommand({
  TableName: 'eigenthrope_chapters',
  Key: { choice_point: choicePoint },
}))
if (!chapterItem.Item) { console.error('Chapter not found.'); process.exit(1) }
if (chapterItem.Item.status === 'closed') { console.log('Already closed.'); process.exit(0) }

const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
if (!vaultAddress) { console.error('EIGENTHROPE_VAULT_ADDRESS not set.'); process.exit(1) }

console.log(`Computing final tally for ${choicePoint}...`)

const res = await fetch(XRPL_RPC, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    method: 'account_tx',
    params: [{ account: vaultAddress, limit: 200 }],
  }),
})
const data = await res.json()
const transactions = data.result?.transactions ?? []
const latestVote = {}
const seen = new Set()

for (const entry of transactions) {
  const tx = entry.tx_json ?? entry.tx
  if (!tx || tx.TransactionType !== 'Payment') continue
  const sender = tx.Account?.trim()
  if (!sender || seen.has(sender)) continue
  const memos = tx.Memos
  if (!memos) continue
  for (const { Memo } of memos) {
    if (!Memo.MemoData) continue
    try {
      const vote = JSON.parse(fromHex(Memo.MemoData))
      if (vote.universe === universe && vote.chapter === chapter && vote.choice_point === cp) {
        latestVote[sender] = { choice: vote.choice, weight: vote.weight ?? 1 }
        seen.add(sender)
      }
    } catch { /* skip */ }
  }
}

const finalTally = {}
for (const { choice, weight } of Object.values(latestVote)) {
  finalTally[choice] = (finalTally[choice] ?? 0) + weight
}

const total = Object.values(finalTally).reduce((a, b) => a + b, 0)
const winningChoice = total > 0
  ? Object.entries(finalTally).sort((a, b) => b[1] - a[1])[0][0]
  : null
const winnerWeight = winningChoice ? (finalTally[winningChoice] ?? 0) : 0
const yieldPct = total > 0 ? computeYield(winnerWeight / total) : MAX_YIELD

console.log('\nFinal tally:')
for (const [choice, weight] of Object.entries(finalTally)) {
  console.log(`  ${choice}: ${weight.toFixed(2)}`)
}
console.log(`Winner: ${winningChoice ?? 'none'}`)
console.log(`Quantum yield: ${Math.round(yieldPct * 100)}%`)

await dynamo.send(new UpdateCommand({
  TableName: 'eigenthrope_chapters',
  Key: { choice_point: choicePoint },
  UpdateExpression: `SET #s = :closed, closed_at = :now, winning_choice = :wc,
                     final_tally = :ft, final_yield_pct = :yp`,
  ConditionExpression: '#s = :open',
  ExpressionAttributeNames: { '#s': 'status' },
  ExpressionAttributeValues: {
    ':closed': 'closed',
    ':open': 'open',
    ':now': new Date().toISOString(),
    ':wc': winningChoice,
    ':ft': finalTally,
    ':yp': yieldPct,
  },
}))

console.log(`\nClosed. Run mint-artifact.mjs to distribute NFTs.`)
