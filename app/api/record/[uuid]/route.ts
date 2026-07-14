import type { NextRequest } from 'next/server'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { SEALS_TABLE, type SealRecord } from '@/lib/record'

const XRPL_RPC = 'https://xrplcluster.com/'

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

/**
 * Confirm the seal transaction on-ledger: validated, from the right wallet,
 * to the vault, carrying exactly this seal's hash. The ledger is the truth —
 * Xaman's "signed" flag alone isn't the anchor, the validated tx is.
 */
async function verifySealOnLedger(txid: string, seal: SealRecord): Promise<boolean> {
  const vault = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
  try {
    const res = await fetch(XRPL_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'tx', params: [{ transaction: txid }] }),
    })
    const raw = await res.text()
    let data: { result?: Record<string, unknown> }
    try { data = JSON.parse(raw) } catch {
      console.error('[record] XRPL non-JSON response (rate limit?):', raw.slice(0, 80))
      return false
    }
    const result = data.result
    if (!result || result.validated !== true) return false
    const tx = (result.tx_json ?? result) as Record<string, unknown>
    if (tx.TransactionType !== 'Payment') return false
    if ((tx.Account as string)?.trim() !== seal.account) return false
    if (vault && (tx.Destination as string)?.trim() !== vault) return false

    const memos = tx.Memos as Array<{ Memo: { MemoData?: string; MemoType?: string } }> | undefined
    for (const { Memo } of memos ?? []) {
      if (!Memo.MemoData) continue
      try {
        const parsed = JSON.parse(fromHex(Memo.MemoData))
        if (parsed.h === seal.hash) return true
      } catch { /* not our memo */ }
    }
    return false
  } catch (err) {
    console.error('[record] ledger verify failed:', err)
    return false
  }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await ctx.params

  const item = await dynamo.send(new GetCommand({
    TableName: SEALS_TABLE,
    Key: { seal_id: uuid },
  }))
  const seal = item.Item as SealRecord | undefined
  if (!seal) return Response.json({ error: 'Unknown seal' }, { status: 404 })

  // Already finalized (poll raced a previous finalize) — nothing left to do.
  if (seal.status !== 'pending_signature') {
    return Response.json({ signed: true, sealed: true, tx_hash: seal.tx_hash ?? null })
  }

  const res = await fetch(`https://xumm.app/api/v1/platform/payload/${uuid}`, {
    headers: {
      'X-API-Key': process.env.NEXT_PUBLIC_XAMAN_API_KEY!,
      'X-API-Secret': process.env.XAMAN_API_SECRET!,
    },
  })
  const data = await res.json()

  const signed = data.meta?.signed ?? false
  const expired = data.meta?.expired ?? false
  const rejected = data.meta?.cancelled ?? false
  const txid = data.response?.txid as string | undefined

  if (!signed || !txid) {
    return Response.json({ signed, expired, rejected, sealed: false })
  }

  const verified = await verifySealOnLedger(txid, seal)
  if (!verified) {
    // Signed per Xaman but not yet verifiable on-ledger (propagation, rate
    // limit) — report signed so the client keeps polling until it verifies.
    return Response.json({ signed: true, expired, rejected, sealed: false })
  }

  await dynamo.send(new UpdateCommand({
    TableName: SEALS_TABLE,
    Key: { seal_id: uuid },
    UpdateExpression: 'SET #s = :sealed, sealed_at = :now, tx_hash = :tx',
    ConditionExpression: '#s = :pending',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':sealed': 'sealed',
      ':pending': 'pending_signature',
      ':now': new Date().toISOString(),
      ':tx': txid,
    },
  })).catch(() => { /* concurrent finalize won — fine */ })

  return Response.json({ signed: true, sealed: true, tx_hash: txid })
}
