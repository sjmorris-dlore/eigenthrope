/**
 * Step 1: Scan XRPL for voters, mint NFTs, write to eigenthrope_minting table.
 *
 * Everyone who voted gets a participation NFT.
 * Among voters for the winning choice, the top yield_pct% by weight also get a winner NFT.
 *
 * Safe to re-run — skips address+artifact_type pairs already recorded.
 *
 * Required Lambda env vars:
 *   VAULT_SECRET_NAME
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

async function mintOne(client, wallet, dynamo, { address, choice_point, winning_choice, artifact_type, taxon, nftUri, weight }) {
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
    throw new Error(`No nftoken_id in mint result for ${address}`)
  }

  await dynamo.send(new PutCommand({
    TableName: MINTING_TABLE,
    Item: {
      nft_token_id: nftTokenId,
      winner_address: address,
      choice_point,
      winning_choice,
      artifact_type,
      status: 'minted',
      minted_at: new Date().toISOString(),
      weight,
    },
  }))

  console.log(`Minted (${artifact_type}) for ${address}: ${nftTokenId}`)
  return nftTokenId
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
    bot_addresses, // observer-bot wallets — excluded from the winner tier when humans are in it
    universe: eventUniverse, // stored chapter fields — may differ from the key
    chapter: eventChapter,   // segments after migrations (e.g. "C01" vs "E01")
  } = event

  const sm = new SecretsManagerClient({ region: 'us-east-1' })
  const secretValue = await sm.send(new GetSecretValueCommand({
    SecretId: process.env.VAULT_SECRET_NAME ?? 'eigenthrope/vault',
  }))
  const { entropy, algorithm } = JSON.parse(secretValue.SecretString)
  const wallet = Wallet.fromEntropy(Buffer.from(entropy, 'hex'), { algorithm })

  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }))

  // Idempotency: track already-minted by address+artifact_type
  const existing = await dynamo.send(new QueryCommand({
    TableName: MINTING_TABLE,
    IndexName: 'choice_point-index',
    KeyConditionExpression: 'choice_point = :cp',
    ExpressionAttributeValues: { ':cp': choice_point },
  }))
  const alreadyMinted = new Set((existing.Items ?? []).map(i => `${i.winner_address}:${i.artifact_type}`))

  const client = new Client(XRPL_WSS)
  await client.connect()

  try {
    // Vote memos carry the STORED universe/chapter fields (that's what the
    // site and bots write), so match on those — key segments only as fallback.
    const [keyUniverse, keyChapter, cp] = choice_point.split(':')
    const universe = eventUniverse ?? keyUniverse
    const chapter = eventChapter ?? keyChapter
    const txResponse = await client.request({
      command: 'account_tx',
      account: vault_address,
      limit: 200,
      forward: false,
    })

    // Collect the latest vote from every address for this choice_point
    const allVoters = {} // address → { choice, weight }
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
            (vote.rv ?? 0) === reset_version
          ) {
            allVoters[sender] = { choice: vote.choice, weight: vote.weight ?? 1 }
            seen.add(sender)
          }
        } catch {}
      }
    }

    // Identify winner tier: voted for winning choice, sorted by weight descending
    const winningVoters = Object.entries(allVoters)
      .filter(([, { choice }]) => choice === winning_choice)
      .map(([address, { weight }]) => ({ address, weight }))
      .sort((a, b) => b.weight - a.weight)

    // Observer bots never take winner-tier slots from humans: if any human
    // voted for the winning choice, the tier is drawn from humans only.
    // Bots become eligible only when the winning side is bots alone.
    const botSet = new Set(bot_addresses ?? [])
    const humanWinningVoters = winningVoters.filter(w => !botSet.has(w.address))
    const eligibleWinners = humanWinningVoters.length > 0 ? humanWinningVoters : winningVoters
    if (humanWinningVoters.length < winningVoters.length) {
      console.log(`Winner tier: ${winningVoters.length - humanWinningVoters.length} bot voter(s) ${humanWinningVoters.length > 0 ? 'excluded (humans present)' : 'eligible (no human winners)'}`)
    }

    const numWinnerTier = Math.max(1, Math.ceil(eligibleWinners.length * (final_yield_pct ?? 0.18)))
    const winnerSet = new Set(eligibleWinners.slice(0, numWinnerTier).map(w => w.address))

    const results = { minted: 0, skipped: 0, errors: [] }

    for (const [address, { choice, weight }] of Object.entries(allVoters)) {
      // Winner NFT — only for top tier of winning-choice voters
      if (winnerSet.has(address)) {
        const key = `${address}:winner`
        if (alreadyMinted.has(key)) {
          console.log(`Skipping winner NFT for ${address} — already minted`)
          results.skipped++
        } else {
          try {
            await mintOne(client, wallet, dynamo, {
              address, choice_point, winning_choice: choice, artifact_type: 'winner',
              taxon: winner_taxon, nftUri: winner_nft_uri, weight,
            })
            results.minted++
          } catch (err) {
            console.error(`Error minting winner NFT for ${address}:`, err)
            results.errors.push(`${address} winner: ${err.message}`)
          }
        }
      }

      // Participation NFT — every voter
      const key = `${address}:participation`
      if (alreadyMinted.has(key)) {
        console.log(`Skipping participation NFT for ${address} — already minted`)
        results.skipped++
      } else {
        try {
          await mintOne(client, wallet, dynamo, {
            address, choice_point, winning_choice: choice, artifact_type: 'participation',
            taxon: participation_taxon, nftUri: participation_nft_uri, weight,
          })
          results.minted++
        } catch (err) {
          console.error(`Error minting participation NFT for ${address}:`, err)
          results.errors.push(`${address} participation: ${err.message}`)
        }
      }
    }

    return results
  } finally {
    await client.disconnect()
  }
}
