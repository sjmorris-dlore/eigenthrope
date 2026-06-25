const XRPL_RPC = 'https://xrplcluster.com/'
export const ARTIFACT_BONUS = 3
export const ARTIFACT_TAXON = 1

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

async function countArtifacts(account: string, issuer: string): Promise<number> {
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
    return nfts.filter((nft) => {
      const n = nft as Record<string, unknown>
      return n.Issuer === issuer && n.NFTokenTaxon === ARTIFACT_TAXON
    }).length
  } catch {
    return 0
  }
}

export interface ResonanceBreakdown {
  votes: number
  artifacts: number
  resonance: number
}

export async function getResonanceBreakdown(
  account: string,
  vaultAddress: string
): Promise<ResonanceBreakdown> {
  const [votes, artifacts] = await Promise.all([
    countVotes(account, vaultAddress),
    countArtifacts(account, vaultAddress),
  ])
  return { votes, artifacts, resonance: votes + 1 + artifacts * ARTIFACT_BONUS }
}

export async function getResonance(
  account: string,
  vaultAddress: string
): Promise<number> {
  const { resonance } = await getResonanceBreakdown(account, vaultAddress)
  return resonance
}
