const XRPL_RPC = 'https://xrplcluster.com/'

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

export async function GET() {
  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
  if (!vaultAddress) {
    return Response.json({ error: 'EIGENTHROPE_VAULT_ADDRESS not set' }, { status: 500 })
  }

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

  const counts: Record<string, number> = {}

  for (const entry of transactions) {
    const tx = (entry as Record<string, unknown>).tx_json ??
                (entry as Record<string, unknown>).tx
    if (!tx || (tx as Record<string, unknown>).TransactionType !== 'Payment') continue

    const memos = (tx as Record<string, unknown>).Memos as Array<{ Memo: { MemoData?: string } }> | undefined
    if (!memos) continue

    for (const { Memo } of memos) {
      if (!Memo.MemoData) continue
      try {
        const vote = JSON.parse(fromHex(Memo.MemoData))
        if (
          vote.universe === 'U001' &&
          vote.chapter === 'C01' &&
          vote.choice_point === 'CP1'
        ) {
          const choice: string = vote.choice
          counts[choice] = (counts[choice] ?? 0) + (vote.weight ?? 1)
        }
      } catch {
        // skip malformed memos
      }
    }
  }

  return Response.json({ counts })
}
