/**
 * Mint-one: mint a SINGLE NFT from the vault to a specific wallet, then
 * create the 0-drop claim offer — the generic single-award path, as opposed
 * to the batch mint-nfts/create-offers pair that pays out a whole episode.
 *
 * First consumer: vindication artifacts for The Record (taxon 3000 + rv).
 * Also intended for future one-off drops (e.g. golden artifacts).
 *
 * Event:
 *   destination_address  wallet that may claim the NFT
 *   nft_uri              ipfs:// metadata URI (nullable — mints without URI)
 *   taxon                NFT taxon, e.g. 3000 + reset_version
 *   artifact_type        'vindication' | 'golden' | ...
 *   reference            provenance key stored as choice_point in both
 *                        tables, e.g. "RECORD:<seal_id>"
 *
 * Required Lambda env vars:
 *   VAULT_SECRET_NAME
 *
 * Required IAM permissions: same role as the batch Lambdas
 *   (secretsmanager:GetSecretValue, dynamodb on minting/artifacts tables).
 */

import { Client, Wallet, convertStringToHex } from 'xrpl'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const SOURCE_TAG = 2606230005
const MINTING_TABLE = 'eigenthrope_minting'
const ARTIFACTS_TABLE = 'eigenthrope_artifacts'
const OFFER_EXPIRY_DAYS = 14
const XRPL_WSS = 'wss://xrplcluster.com/'

export async function handler(event) {
  const { destination_address, nft_uri, taxon, artifact_type, reference } = event

  if (!destination_address || taxon == null || !artifact_type || !reference) {
    throw new Error('destination_address, taxon, artifact_type, and reference are required')
  }

  const sm = new SecretsManagerClient({ region: 'us-east-1' })
  const secretValue = await sm.send(new GetSecretValueCommand({
    SecretId: process.env.VAULT_SECRET_NAME ?? 'eigenthrope/vault',
  }))
  const { entropy, algorithm } = JSON.parse(secretValue.SecretString)
  const wallet = Wallet.fromEntropy(Buffer.from(entropy, 'hex'), { algorithm })

  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }))

  const client = new Client(XRPL_WSS)
  await client.connect()

  try {
    // 1. Mint
    const mintResult = await client.submitAndWait({
      TransactionType: 'NFTokenMint',
      Account: wallet.address,
      NFTokenTaxon: taxon,
      Flags: 8, // tfTransferable
      SourceTag: SOURCE_TAG,
      ...(nft_uri ? { URI: convertStringToHex(nft_uri) } : {}),
    }, { wallet })

    const nftTokenId = mintResult.result.meta?.nftoken_id
    if (!nftTokenId) throw new Error(`No nftoken_id in mint result for ${destination_address}`)

    await dynamo.send(new PutCommand({
      TableName: MINTING_TABLE,
      Item: {
        nft_token_id: nftTokenId,
        winner_address: destination_address,
        choice_point: reference,
        winning_choice: null,
        artifact_type,
        status: 'minted',
        minted_at: new Date().toISOString(),
      },
    }))
    console.log(`Minted (${artifact_type}) for ${destination_address}: ${nftTokenId}`)

    // 2. Offer
    const offerResult = await client.submitAndWait({
      TransactionType: 'NFTokenCreateOffer',
      Account: wallet.address,
      NFTokenID: nftTokenId,
      Amount: '0',
      Destination: destination_address,
      Flags: 1, // tfSellNFToken
      SourceTag: SOURCE_TAG,
    }, { wallet })

    const offerNode = offerResult.result.meta?.AffectedNodes?.find(
      n => n.CreatedNode?.LedgerEntryType === 'NFTokenOffer'
    )
    const offerId = offerNode?.CreatedNode?.LedgerIndex
    if (!offerId) throw new Error(`No offer ID in result for ${destination_address} / ${nftTokenId}`)

    await dynamo.send(new PutCommand({
      TableName: ARTIFACTS_TABLE,
      Item: {
        offer_id: offerId,
        winner_address: destination_address,
        nft_token_id: nftTokenId,
        choice_point: reference,
        winning_choice: null,
        artifact_type,
        status: 'pending',
        expires_at: new Date(Date.now() + OFFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        offered_at: new Date().toISOString(),
      },
    }))

    await dynamo.send(new UpdateCommand({
      TableName: MINTING_TABLE,
      Key: { nft_token_id: nftTokenId },
      UpdateExpression: 'SET #s = :offered, offer_id = :oid, offered_at = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':offered': 'offered',
        ':oid': offerId,
        ':now': new Date().toISOString(),
      },
    }))

    console.log(`Offer created for ${destination_address}: ${offerId}`)
    return { nft_token_id: nftTokenId, offer_id: offerId }
  } finally {
    await client.disconnect()
  }
}
