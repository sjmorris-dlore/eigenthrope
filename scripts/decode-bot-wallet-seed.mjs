/**
 * Converts XUMM/Xaman Secret Numbers (8 rows of 6 digits) to an XRPL family
 * seed, verifies it matches the expected address, then stores it in AWS
 * Secrets Manager for one of the observer bots (vesper_null / amber_drift).
 *
 * Same decoding approach as decode-vault-seed.mjs (Xaman doesn't say which
 * algorithm/byte-order it used, so this tries all 4 combinations and keeps
 * whichever produces the expected address). Unlike that script — which
 * stores {entropy, algorithm} for Lambda's Wallet.fromEntropy() — this
 * stores a plain seed string, matching what bots/src/aws.ts's
 * fetchWalletSeed() expects. A seed string is self-describing (it encodes
 * its own algorithm), so bots/src/xrplVote.ts's plain Wallet.fromSeed(seed)
 * call reconstructs the right keypair regardless of which algorithm matched.
 *
 * Usage:
 *   1. Add to .env.local:  BOT_WALLET_NUMBERS=XXXXXX XXXXXX XXXXXX XXXXXX XXXXXX XXXXXX XXXXXX XXXXXX
 *   2. node --env-file=.env.local scripts/decode-bot-wallet-seed.mjs <character_name> <expected_address>
 *      e.g. node --env-file=.env.local scripts/decode-bot-wallet-seed.mjs vesper_null rXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
 *   3. Remove BOT_WALLET_NUMBERS from .env.local
 *   4. Repeat for the second bot (new numbers, new expected address)
 *
 * Stores the secret at eigenthrope/<character_name>_wallet, matching the
 * VESPER_NULL_WALLET_SECRET / AMBER_DRIFT_WALLET_SECRET convention in
 * bots/.env.example — set that env var to the printed secret name afterward.
 */

import { execSync } from 'child_process'
import { Wallet } from '../node_modules/xrpl/dist/npm/index.js'

const characterName = process.argv[2]
const expectedAddress = process.argv[3]

if (!characterName || !expectedAddress) {
  console.error('Usage: node --env-file=.env.local scripts/decode-bot-wallet-seed.mjs <character_name> <expected_address>')
  process.exit(1)
}

const numbersRaw = process.env.BOT_WALLET_NUMBERS
const awsKey = process.env.AWS_ACCESS_KEY_ID
const awsSecret = process.env.AWS_SECRET_ACCESS_KEY

if (!numbersRaw) {
  console.error('BOT_WALLET_NUMBERS not set.')
  console.error('Add it to .env.local, then run with:')
  console.error('  node --env-file=.env.local scripts/decode-bot-wallet-seed.mjs <character_name> <expected_address>')
  process.exit(1)
}

// ── Decode Secret Numbers → 16-byte entropy ───────────────────────────────────
const rows = numbersRaw.trim().split(/\s+/)
if (rows.length !== 8) {
  console.error(`Expected 8 groups of 6 digits, got ${rows.length}`)
  process.exit(1)
}

const values = []
for (let i = 0; i < 8; i++) {
  const row = rows[i].replace(/\D/g, '')
  if (row.length !== 6) {
    console.error(`Row ${i + 1} must be exactly 6 digits, got: "${rows[i]}"`)
    process.exit(1)
  }
  const value = parseInt(row.slice(0, 5), 10)
  if (value > 65535) {
    console.error(`Row ${i + 1} data value ${value} exceeds 65535`)
    process.exit(1)
  }
  values.push(value)
}

// Try all combinations of byte order × key algorithm to find the match
const algorithms = ['ed25519', 'ecdsa-secp256k1']
const byteOrders = ['BE', 'LE']
let wallet = null
let matchedAlgo = null

for (const algo of algorithms) {
  for (const order of byteOrders) {
    const buf = Buffer.alloc(16)
    for (let i = 0; i < 8; i++) {
      if (order === 'BE') buf.writeUInt16BE(values[i], i * 2)
      else               buf.writeUInt16LE(values[i], i * 2)
    }
    try {
      const w = Wallet.fromEntropy(buf, { algorithm: algo })
      console.log(`  [${algo} ${order}] → ${w.address}`)
      if (w.address === expectedAddress) {
        wallet = w
        matchedAlgo = algo
        console.log(`\n✓ Match found (${algo}, ${order} byte order)`)
      }
    } catch {}
  }
}

console.log(`\nExpected: ${expectedAddress}`)

if (!wallet) {
  console.error('\n❌ No combination matched the expected address.')
  console.error('The secret numbers may be entered in the wrong order, or the address is wrong.')
  process.exit(1)
}

console.log('✓ Address verified.')
console.log(`  Algorithm: ${matchedAlgo}`)

// ── Store in Secrets Manager ──────────────────────────────────────────────────
const secretId = `eigenthrope/${characterName}_wallet`
const secretString = JSON.stringify({ seed: wallet.seed })
const escaped = secretString.replace(/"/g, '\\"')
const awsEnv = { env: { ...process.env, AWS_ACCESS_KEY_ID: awsKey, AWS_SECRET_ACCESS_KEY: awsSecret }, stdio: 'pipe' }

try {
  execSync(`aws secretsmanager create-secret --region us-east-1 --name ${secretId} --secret-string "${escaped}"`, awsEnv)
  console.log(`\n✓ Secret created: ${secretId}`)
} catch (e) {
  if (e.stderr?.toString().includes('ResourceExistsException')) {
    try {
      execSync(`aws secretsmanager update-secret --region us-east-1 --secret-id ${secretId} --secret-string "${escaped}"`, awsEnv)
      console.log(`\n✓ Secret updated: ${secretId}`)
    } catch (e2) {
      console.error('Failed to update Secrets Manager:', e2.stderr?.toString() ?? e2.message)
      process.exit(1)
    }
  } else {
    console.error('Failed to create secret in Secrets Manager:', e.stderr?.toString() ?? e.message)
    process.exit(1)
  }
}

console.log(`\nDone. Set in bots/.env:`)
console.log(`  ${characterName.toUpperCase()}_WALLET_SECRET=${secretId}`)
console.log('\nRemove BOT_WALLET_NUMBERS from .env.local.')
