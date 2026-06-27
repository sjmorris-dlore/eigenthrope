/**
 * Step 2: For each 'minted' record in eigenthrope_minting, create a sell offer
 * to the winner for 0 XRP, then write the final record to eigenthrope_artifacts
 * (where the claim UI reads from) and mark the minting record 'offered'.
 *
 * Safe to re-run — skips records already in 'offered' status.
 *
 * Required Lambda env vars:
 *   VAULT_SECRET_NAME
 *
 * Required IAM permissions:
 *   secretsmanager:GetSecretValue on the vault secret
 *   dynamodb:Query/UpdateItem on eigenthrope_minting
 *   dynamodb:PutItem on eigenthrope_artifacts
 */

import { Client, Wallet } from 'xrpl'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

const SOURCE_TAG = 2606230005
const MINTING_TABLE = 'eigenthrope_minting'
const ARTIFACTS_TABLE = 'eigenthrope_artifacts'
const OFFER_EXPIRY_DAYS = 14
const XRPL_WSS = 'wss://xrplcluster.com/'

export async function handler(event) {
  const { choice_point } = event

  const sm = new SecretsManagerClient({ region: 'us-east-1' })
  const secretValue = await sm.send(new GetSecretValueCommand({
    SecretId: process.env.VAULT_SECRET_NAME ?? 'eigenthrope/vault',
  }))
  const { seed } = JSON.parse(secretValue.SecretString)
  const wallet = Wallet.fromSeed(seed)

  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }))

  // Get all minted (not yet offered) records for this chapter
  const minted = await dynamo.send(new QueryCommand({
    TableName: MINTING_TABLE,
    IndexName: 'choice_point-index',
    KeyConditionExpression: 'choice_point = :cp',
    FilterExpression: '#s = :minted',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':cp': choice_point, ':minted': 'minted' },
  }))

  const records = minted.Items ?? []
  if (records.length === 0) {
    console.log('No minted records to process for', choice_point)
    return { offers_created: 0, skipped: 0, errors: [] }
  }

  const client = new Client(XRPL_WSS)
  await client.connect()

  const results = { offers_created: 0, skipped: 0, errors: [] }
  const expiresAt = new Date(Date.now() + OFFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()

  try {
    for (const record of records) {
      const { nft_token_id, winner_address, artifact_type, weight, winning_choice } = record

      try {
        const offerTx = {
          TransactionType: 'NFTokenCreateOffer',
          Account: wallet.address,
          NFTokenID: nft_token_id,
          Amount: '0',
          Destination: winner_address,
          Flags: 1, // tfSellNFToken
          SourceTag: SOURCE_TAG,
        }

        const offerResult = await client.submitAndWait(offerTx, { wallet })

        // Offer ID = LedgerIndex of the created NFTokenOffer ledger object
        const offerNode = offerResult.result.meta?.AffectedNodes?.find(
          n => n.CreatedNode?.LedgerEntryType === 'NFTokenOffer'
        )
        const offerId = offerNode?.CreatedNode?.LedgerIndex

        if (!offerId) {
          const msg = `No offer ID in result for ${winner_address} / ${nft_token_id}`
          console.error(msg, offerResult.result)
          results.errors.push(msg)
          continue
        }

        // Write final artifact record (claim UI reads this)
        await dynamo.send(new PutCommand({
          TableName: ARTIFACTS_TABLE,
          Item: {
            offer_id: offerId,
            winner_address,
            nft_token_id,
            choice_point,
            winning_choice,
            artifact_type,
            status: 'pending',
            expires_at: expiresAt,
            offered_at: new Date().toISOString(),
            weight,
          },
        }))

        // Mark minting record as offered
        await dynamo.send(new UpdateCommand({
          TableName: MINTING_TABLE,
          Key: { nft_token_id },
          UpdateExpression: 'SET #s = :offered, offer_id = :oid, offered_at = :now',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: {
            ':offered': 'offered',
            ':oid': offerId,
            ':now': new Date().toISOString(),
          },
        }))

        console.log(`Offer created for ${winner_address}: ${offerId}`)
        results.offers_created++
      } catch (err) {
        console.error(`Error creating offer for ${winner_address}:`, err)
        results.errors.push(`${winner_address}: ${err.message}`)
      }
    }
  } finally {
    await client.disconnect()
  }

  return results
}
