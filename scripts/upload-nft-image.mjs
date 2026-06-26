/**
 * Upload an NFT image to IPFS via Pinata.
 *
 * Usage:
 *   node scripts/upload-nft-image.mjs --file ./images/participation.png --name "Chapter 1 Observer"
 *   node scripts/upload-nft-image.mjs --file ./images/winner.png --name "Chapter 1 Winner"
 *
 * Requires in .env.local:
 *   PINATA_JWT — from pinata.cloud → API Keys → New Key (pinFileToIPFS permission)
 *
 * Prints the gateway URL to use with --uri in the mint scripts.
 */

import { readFileSync } from 'fs'
import { basename } from 'path'
import { config } from 'dotenv'

config({ path: '.env.local' })

function getArg(flag) {
  const idx = process.argv.indexOf(flag)
  return idx !== -1 ? process.argv[idx + 1] : null
}

const FILE = getArg('--file')
const NAME = getArg('--name')

if (!FILE || !NAME) {
  console.error('Usage: node scripts/upload-nft-image.mjs --file ./image.png --name "My NFT"')
  process.exit(1)
}

const jwt = process.env.PINATA_JWT
if (!jwt) {
  console.error('PINATA_JWT not set in .env.local')
  console.error('Get one at: pinata.cloud → API Keys → New Key (enable pinFileToIPFS)')
  process.exit(1)
}

const fileBuffer = readFileSync(FILE)
const blob = new Blob([fileBuffer])
const form = new FormData()
form.append('file', blob, basename(FILE))
form.append('name', NAME)

console.log(`Uploading "${NAME}" (${basename(FILE)})...`)

const res = await fetch('https://uploads.pinata.cloud/v3/files', {
  method: 'POST',
  headers: { Authorization: `Bearer ${jwt}` },
  body: form,
})

const data = await res.json()

if (!res.ok) {
  console.error('Pinata error:', data)
  process.exit(1)
}

const cid = data.data?.cid
console.log(`\nUploaded successfully.`)
console.log(`CID:         ${cid}`)
console.log(`\nUse with mint scripts:`)
console.log(`  --uri ipfs://${cid}`)
