/**
 * One-off script: set the Domain field on the Eigenthrope vault account.
 * Run once from the project root:
 *   node set-domain.mjs
 *
 * Requires AWS credentials in environment (reads vault entropy from Secrets Manager).
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { Client, Wallet } from 'xrpl'

const DOMAIN = 'eigenthrope.sjmorriswrites.com'
const DOMAIN_HEX = Buffer.from(DOMAIN, 'ascii').toString('hex')
const SOURCE_TAG = 2606230005
const XRPL_WSS = 'wss://xrplcluster.com/'

const sm = new SecretsManagerClient({ region: 'us-east-1' })
const { SecretString } = await sm.send(new GetSecretValueCommand({
  SecretId: process.env.VAULT_SECRET_NAME ?? 'eigenthrope/vault',
}))
const { entropy, algorithm } = JSON.parse(SecretString)
const wallet = Wallet.fromEntropy(Buffer.from(entropy, 'hex'), { algorithm })

console.log(`Vault address : ${wallet.address}`)
console.log(`Setting Domain: ${DOMAIN}`)
console.log(`Hex           : ${DOMAIN_HEX}`)

const client = new Client(XRPL_WSS)
await client.connect()

try {
  const result = await client.submitAndWait(
    {
      TransactionType: 'AccountSet',
      Account: wallet.address,
      Domain: DOMAIN_HEX,
      SourceTag: SOURCE_TAG,
    },
    { wallet }
  )
  console.log('Result:', result.result.meta?.TransactionResult)
  console.log('Done — verify at: https://xrpl.fi/verify')
} finally {
  await client.disconnect()
}
