/**
 * Converts XUMM/Xaman Secret Numbers (8 rows of 6 digits) to an XRPL family
 * seed, verifies it matches EIGENTHROPE_VAULT_ADDRESS, then stores it in
 * AWS Secrets Manager under the key eigenthrope/vault.
 *
 * Usage:
 *   1. Add to .env.local:  EIGENTHROPE_VAULT_NUMBERS=XXXXXX XXXXXX XXXXXX XXXXXX XXXXXX XXXXXX XXXXXX XXXXXX
 *   2. node scripts/decode-vault-seed.mjs
 *   3. Remove EIGENTHROPE_VAULT_NUMBERS from .env.local
 */

import { execSync } from 'child_process'
import { Wallet } from '../node_modules/xrpl/dist/npm/index.js'

// Run with: node --env-file=.env.local scripts/decode-vault-seed.mjs
const numbersRaw = process.env.EIGENTHROPE_VAULT_NUMBERS
const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS
const awsKey = process.env.AWS_ACCESS_KEY_ID
const awsSecret = process.env.AWS_SECRET_ACCESS_KEY

if (!numbersRaw) {
  console.error('EIGENTHROPE_VAULT_NUMBERS not set.')
  console.error('Run with: node --env-file=.env.local scripts/decode-vault-seed.mjs')
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

for (const algo of algorithms) {
  for (const order of byteOrders) {
    const entropy = Buffer.alloc(16)
    for (let i = 0; i < 8; i++) {
      if (order === 'BE') entropy.writeUInt16BE(values[i], i * 2)
      else               entropy.writeUInt16LE(values[i], i * 2)
    }
    try {
      const w = Wallet.fromEntropy(entropy, { algorithm: algo })
      console.log(`  [${algo} ${order}] → ${w.address}`)
      if (w.address === vaultAddress) {
        wallet = w
        console.log(`\n✓ Match found (${algo}, ${order} byte order)`)
      }
    } catch {}
  }
}

console.log(`\nExpected: ${vaultAddress}`)

if (!wallet) {
  console.error('\n❌ No combination matched the vault address.')
  console.error('The secret numbers may be entered in the wrong order, or the algorithm differs.')
  process.exit(1)
}

console.log('✓ Address verified.')
console.log(`Family seed: ${wallet.seed}`)

// ── Update Secrets Manager via AWS CLI ───────────────────────────────────────
try {
  const secret = JSON.stringify({ seed: wallet.seed })
  execSync(
    `aws secretsmanager update-secret --region us-east-1 --secret-id eigenthrope/vault --secret-string "${secret.replace(/"/g, '\\"')}"`,
    { env: { ...process.env, AWS_ACCESS_KEY_ID: awsKey, AWS_SECRET_ACCESS_KEY: awsSecret }, stdio: 'pipe' }
  )
  console.log('✓ Secrets Manager updated with correct seed.')
} catch (e) {
  console.error('Failed to update Secrets Manager:', e.stderr?.toString() ?? e.message)
  process.exit(1)
}

console.log('\nDone. Remove EIGENTHROPE_VAULT_NUMBERS from .env.local.')
