/**
 * Step 1: Scan XRPL for winners, mint NFTs, write to eigenthrope_minting table.
 *
 * Invoked async from /api/admin/mint. Safe to re-run — skips accounts that
 * already have a minting record for this choice_point.
 *
 * Required Lambda env vars:
 *   VAULT_SECRET_NAME  — Secrets Manager secret name containing { "seed": "s..." }
 *
 * Required IAM permissions:
 *   secretsmanager:GetSecretValue on the vault secret
 *   dynamodb:PutItem / GetItem / Query on eigenthrope_minting
 */

import { Client, Wallet, convertStringToHex } from 'xrpl'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

const SOURCE_TAG = 2606230005
const MINTING_TABLE = 'eigenthrope_minting'
const XRPL_WSS = 'wss://xrplcluster.com/'

function fromHex(hex) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

export async function handler(event) {
  const {
    choice_point,
    winning_choice,
    final_yield_pct,
    winner_taxon,
    participation_taxon,
    winner_nft_uri,
    participation_nft_uri,
    vault_address,
    reset_version,
  } = event

  const sm = new SecretsManagerClient({ region: 'us-east-1' })
  const secretValue = await sm.send(new GetSecretValueCommand({
    SecretId: process.env.VAULT_SECRET_NAME ?? 'eigenthrope/vault',
  }))
  const { seed } = JSON.parse(secretValue.SecretString)
  const wallet = Wallet.fromSeed(seed)

  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }))

  // Find accounts already processed for this chapter (idempotency)
  const existing = await dynamo.send(new QueryCommand({
    TableName: MINTING_TABLE,
    IndexName: 'choice_point-index',
    KeyConditionExpression: 'choice_point = :cp',
    ExpressionAttributeValues: { ':cp': choice_point },
  }))
  const alreadyMinted = new Set((existing.Items ?? []).map(i => i.winner_address))

  const client = new Client(XRPL_WSS)
  await client.connect()

  try {
    // Scan vault transactions for winners on this choice point
    const [universe, chapter, cp] = choice_point.split(':')
    const txResponse = await client.request({
      command: 'account_tx',
      account: vault_address,
      limit: 200,
      forward: false,
    })

    const latestVote = {}
    const seen = new Set()

    for (const entry of txResponse.result.transactions) {
      const tx = entry.tx_json ?? entry.tx
      if (!tx || tx.TransactionType !== 'Payment') continue
      const sender = tx.Account?.trim()
      if (!sender || seen.has(sender)) continue

      for (const { Memo } of tx.Memos ?? []) {
        if (!Memo?.MemoData) continue
        try {
          const vote = JSON.parse(fromHex(Memo.MemoData))
          if (
            vote.universe === universe &&
            vote.chapter === chapter &&
            vote.choice_point === cp &&
            (vote.rv ?? 0) === reset_version &&
            vote.choice === winning_choice
          ) {
            latestVote[sender] = { weight: vote.weight ?? 1 }
            seen.add(sender)
          }
        } catch {}
      }
    }

    // Sort by weight descending; top yield_pct% get winner NFTs, rest get participation
    const winners = Object.entries(latestVote)
      .map(([address, { weight }]) => ({ address, weight }))
      .sort((a, b) => b.weight - a.weight)

    const numWinnerTier = Math.max(1, Math.ceil(winners.length * (final_yield_pct ?? 0.18)))

    const results = { minted: 0, skipped: 0, errors: [] }

    for (let i = 0; i < winners.length; i++) {
      const { address, weight } = winners[i]

      if (alreadyMinted.has(address)) {
        console.log(`Skipping ${address} — already minted`)
        results.skipped++
        continue
      }

      const isWinnerTier = i < numWinnerTier
      const taxon = isWinnerTier ? winner_taxon : participation_taxon
      const nftUri = isWinnerTier ? winner_nft_uri : participation_nft_uri

      try {
        const mintTx = {
          TransactionType: 'NFTokenMint',
          Account: wallet.address,
          NFTokenTaxon: taxon,
          Flags: 8, // tfTransferable
          SourceTag: SOURCE_TAG,
          ...(nftUri ? { URI: convertStringToHex(nftUri) } : {}),
        }

        const mintResult = await client.submitAndWait(mintTx, { wallet })
        const nftTokenId = mintResult.result.meta?.nftoken_id

        if (!nftTokenId) {
          const msg = `No nftoken_id in mint result for ${address}`
          console.error(msg, mintResult.result)
          results.errors.push(msg)
          continue
        }

        await dynamo.send(new PutCommand({
          TableName: MINTING_TABLE,
          Item: {
            nft_token_id: nftTokenId,
            winner_address: address,
            choice_point,
            winning_choice,
            artifact_type: isWinnerTier ? 'winner' : 'participation',
            status: 'minted',
            minted_at: new Date().toISOString(),
            weight,
          },
        }))

        console.log(`Minted (${isWinnerTier ? 'winner' : 'participation'}) for ${address}: ${nftTokenId}`)
        results.minted++
      } catch (err) {
        console.error(`Error minting for ${address}:`, err)
        results.errors.push(`${address}: ${err.message}`)
      }
    }

    return results
  } finally {
    await client.disconnect()
  }
}
