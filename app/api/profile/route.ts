import { getResonanceBreakdown } from '@/lib/resonance'
import { getTier } from '@/lib/tiers'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const account = searchParams.get('account')?.trim()

  if (!account) {
    return Response.json({ error: 'account required' }, { status: 400 })
  }

  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
  if (!vaultAddress) {
    return Response.json({ error: 'EIGENTHROPE_VAULT_ADDRESS not set' }, { status: 500 })
  }

  const breakdown = await getResonanceBreakdown(account, vaultAddress)
  return Response.json({ ...breakdown, tier: getTier(breakdown.resonance) })
}
