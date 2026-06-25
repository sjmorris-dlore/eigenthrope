import { NextRequest } from 'next/server'
import { getResonance } from '@/lib/resonance'

export async function GET(request: NextRequest) {
  const account = request.nextUrl.searchParams.get('account')?.trim()
  if (!account) {
    return Response.json({ error: 'account required' }, { status: 400 })
  }

  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
  if (!vaultAddress) {
    return Response.json({ error: 'EIGENTHROPE_VAULT_ADDRESS not set' }, { status: 500 })
  }

  const resonance = await getResonance(account, vaultAddress)
  return Response.json({ resonance })
}
