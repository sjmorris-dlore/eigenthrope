const XRPL_RPC = 'https://xrplcluster.com/'

export const WINNER_TAXON = 1
export const WINNER_BONUS = 5
export const PARTICIPATION_TAXON = 2
export const PARTICIPATION_BONUS = 1

// Keep old export name so any stale imports don't break at runtime
export const ARTIFACT_TAXON = WINNER_TAXON
export const ARTIFACT_BONUS = WINNER_BONUS

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

async function countVotes(account: string, vaultAddress: string): Promise<number> {
  const res = await fetch(XRPL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'account_tx',
      params: [{ account: vaultAddress, limit: 200 }],
    }),
  })

  const data = await res.json()
  const transactions: unknown[] = data.result?.transactions ?? []
  const participated = new Set<string>()

  for (const entry of transactions) {
    const tx = (entry as Record<string, unknown>).tx_json ??
                (entry as Record<string, unknown>).tx
    if (!tx) continue
    const t = tx as Record<string, unknown>
    if (t.TransactionType !== 'Payment') continue
    if ((t.Account as string)?.trim() !== account) continue

    const memos = t.Memos as Array<{ Memo: { MemoData?: string } }> | undefined
    if (!memos) continue

    for (const { Memo } of memos) {
      if (!Memo.MemoData) continue
      try {
        const vote = JSON.parse(fromHex(Memo.MemoData))
        if (vote.universe && vote.chapter && vote.choice_point) {
          participated.add(`${vote.universe}:${vote.chapter}:${vote.choice_point}`)
        }
      } catch {
        // skip malformed memos
      }
    }
  }

  return participated.size
}

async function countArtifacts(
  account: string,
  issuer: string
): Promise<{ winners: number; participation: number }> {
  try {
    const res = await fetch(XRPL_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_nfts',
        params: [{ account, limit: 400 }],
      }),
    })
    const data = await res.json()
    const nfts: unknown[] = data.result?.account_nfts ?? []
    let winners = 0
    let participation = 0
    for (const nft of nfts) {
      const n = nft as Record<string, unknown>
      if (n.Issuer !== issuer) continue
      if (n.NFTokenTaxon === WINNER_TAXON) winners++
      else if (n.NFTokenTaxon === PARTICIPATION_TAXON) participation++
    }
    return { winners, participation }
  } catch {
    return { winners: 0, participation: 0 }
  }
}

export interface ResonanceBreakdown {
  votes: number
  artifacts: number
  winner_artifacts: number
  participation_artifacts: number
  resonance: number
}

export async function getResonanceBreakdown(
  account: string,
  vaultAddress: string
): Promise<ResonanceBreakdown> {
  const [votes, { winners, participation }] = await Promise.all([
    countVotes(account, vaultAddress),
    countArtifacts(account, vaultAddress),
  ])
  return {
    votes,
    winner_artifacts: winners,
    participation_artifacts: participation,
    artifacts: winners + participation,
    resonance: votes + 1 + winners * WINNER_BONUS + participation * PARTICIPATION_BONUS,
  }
}

export async function getResonance(
  account: string,
  vaultAddress: string
): Promise<number> {
  const { resonance } = await getResonanceBreakdown(account, vaultAddress)
  return resonance
}
