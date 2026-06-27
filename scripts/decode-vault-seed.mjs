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

import { readFileSync } from 'fs'
import { Wallet } from '../node_modules/xrpl/dist/npm/index.js'
import { SecretsManagerClient, UpdateSecretCommand } from '../node_modules/@aws-sdk/client-secrets-manager/dist-cjs/index.js'

// ── Parse .env.local ──────────────────────────────────────────────────────────
const env = {}
try {
  const lines = readFileSync('.env.local', 'utf8').split('\n')
  for (const line of lines) {
    const m = line.match(/^([^=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim()
  }
} catch {
  console.error('Could not read .env.local')
  process.exit(1)
}

const numbersRaw = env['EIGENTHROPE_VAULT_NUMBERS']
const vaultAddress = env['EIGENTHROPE_VAULT_ADDRESS']
const awsKey = env['AWS_ACCESS_KEY_ID']
const awsSecret = env['AWS_SECRET_ACCESS_KEY']

if (!numbersRaw) {
  console.error('EIGENTHROPE_VAULT_NUMBERS not set in .env.local')
  console.error('Format: 6-digit groups separated by spaces, e.g.: 012345 678901 ...')
  process.exit(1)
}

// ── Decode Secret Numbers → 16-byte entropy ───────────────────────────────────
// Algorithm: each of 8 rows is a 6-digit string where:
//   - Digits 0–4 are the data value (0–65535, big-endian 2 bytes)
//   - Digit 5 is checksum: (value * (position * 2 + 1)) % 9
const rows = numbersRaw.trim().split(/\s+/)
if (rows.length !== 8) {
  console.error(`Expected 8 groups of 6 digits, got ${rows.length}`)
  process.exit(1)
}

const entropy = Buffer.alloc(16)
for (let i = 0; i < 8; i++) {
  const row = rows[i].replace(/\D/g, '')
  if (row.length !== 6) {
    console.error(`Row ${i + 1} must be exactly 6 digits, got: "${rows[i]}"`)
    process.exit(1)
  }

  const value = parseInt(row.slice(0, 5), 10)
  const checkDigit = parseInt(row[5], 10)
  const expectedCheck = (value * (i * 2 + 1)) % 9

  if (checkDigit !== expectedCheck) {
    console.error(`Row ${i + 1} checksum mismatch: digit is ${checkDigit}, expected ${expectedCheck}`)
    console.error('Double-check the numbers — a transcription error may have occurred.')
    process.exit(1)
  }

  if (value > 65535) {
    console.error(`Row ${i + 1} data value ${value} exceeds 65535 (max for 2 bytes)`)
    process.exit(1)
  }

  entropy.writeUInt16BE(value, i * 2)
}

// ── Derive wallet and verify address ─────────────────────────────────────────
let wallet
try {
  wallet = Wallet.fromEntropy(entropy)
} catch (e) {
  console.error('Failed to derive wallet from entropy:', e.message)
  process.exit(1)
}

console.log(`Derived address: ${wallet.address}`)
console.log(`Expected address: ${vaultAddress}`)

if (wallet.address !== vaultAddress) {
  console.error('\n❌ Address mismatch — the numbers do not match the vault wallet.')
  console.error('Try checking for transposed digits or wrong row order.')
  process.exit(1)
}

console.log('✓ Address verified.')
console.log(`Family seed: ${wallet.seed}`)

// ── Update Secrets Manager ────────────────────────────────────────────────────
const sm = new SecretsManagerClient({
  region: 'us-east-1',
  credentials: { accessKeyId: awsKey, secretAccessKey: awsSecret },
})

try {
  await sm.send(new UpdateSecretCommand({
    SecretId: 'eigenthrope/vault',
    SecretString: JSON.stringify({ seed: wallet.seed }),
  }))
  console.log('✓ Secrets Manager updated with correct seed.')
} catch (e) {
  console.error('Failed to update Secrets Manager:', e.message)
  process.exit(1)
}

console.log('\nDone. Remove EIGENTHROPE_VAULT_NUMBERS from .env.local.')
