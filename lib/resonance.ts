const XRPL_RPC = 'https://xrplcluster.com/'

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

export async function getResonance(
  account: string,
  vaultAddress: string
): Promise<number> {
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

  // Count distinct choice points this wallet has voted on
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

  return participated.size + 1
}
