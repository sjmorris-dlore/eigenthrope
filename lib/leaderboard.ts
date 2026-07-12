import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from './dynamo'
import { getResetVersion } from './config'
import { getResonanceBreakdown, type ResonanceBreakdown } from './resonance'

const XRPL_RPC = 'https://xrplcluster.com/'

export interface LeaderboardEntry extends ResonanceBreakdown {
  account: string
  /** Player-chosen public display name (opt-in via the wallet page) */
  alias?: string
  /** Set for the game's own observer bots — displayed by name with a badge */
  bot_name?: string
}

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

/** Every address that has cast a well-formed vote at the current reset version. */
async function getVoterAccounts(vaultAddress: string, resetVersion: number): Promise<string[]> {
  const res = await fetch(XRPL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'account_tx',
      params: [{ account: vaultAddress, limit: 400, forward: false }],
    }),
  })
  const data = await res.json()
  const voters = new Set<string>()
  for (const entry of (data.result?.transactions ?? []) as unknown[]) {
    const e = entry as { tx_json?: Record<string, unknown>; tx?: Record<string, unknown> }
    const tx = e.tx_json ?? e.tx
    if (!tx || tx.TransactionType !== 'Payment') continue
    const sender = (tx.Account as string)?.trim()
    if (!sender || voters.has(sender)) continue
    const memos = tx.Memos as Array<{ Memo?: { MemoData?: string } }> | undefined
    for (const { Memo } of memos ?? []) {
      if (!Memo?.MemoData) continue
      try {
        const vote = JSON.parse(fromHex(Memo.MemoData))
        if (vote.universe && vote.chapter && vote.choice_point && (vote.rv ?? 0) === resetVersion) {
          voters.add(sender)
          break
        }
      } catch { /* malformed memo */ }
    }
  }
  return [...voters]
}

/** All opt-in aliases, keyed by account. Stored as alias:<account> config items. */
export async function getAliases(): Promise<Map<string, string>> {
  const aliases = new Map<string, string>()
  try {
    const res = await dynamo.send(new ScanCommand({
      TableName: 'eigenthrope_config',
      FilterExpression: 'begins_with(#k, :prefix)',
      ExpressionAttributeNames: { '#k': 'key' },
      ExpressionAttributeValues: { ':prefix': 'alias:' },
    }))
    for (const item of res.Items ?? []) {
      const key = item.key as string
      const value = item.value
      if (typeof value === 'string' && value.trim()) {
        aliases.set(key.slice('alias:'.length), value.trim())
      }
    }
  } catch { /* aliases are cosmetic — never fail the board */ }
  return aliases
}

export async function getLeaderboard(vaultAddress: string): Promise<LeaderboardEntry[]> {
  const [botAddressMap, aliases] = await Promise.all([
    getBotAddressNameMap(),
    getAliases(),
  ])

  const resetVersion = await getResetVersion()

  const accounts = await getVoterAccounts(vaultAddress, resetVersion)
  // Bots belong on the board even in a round where they haven't voted yet
  for (const addr of botAddressMap.keys()) {
    if (!accounts.includes(addr)) accounts.push(addr)
  }

  const entries = await Promise.all(accounts.map(async (account): Promise<LeaderboardEntry> => {
    const breakdown = await getResonanceBreakdown(account, vaultAddress)
    return {
      account,
      ...breakdown,
      alias: aliases.get(account),
      bot_name: botAddressMap.get(account),
    }
  }))

  return entries.sort((a, b) => b.resonance - a.resonance || a.account.localeCompare(b.account))
}

/** address → bot name, inverted from the bot_addresses config map. */
async function getBotAddressNameMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  try {
    const res = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'bot_addresses' },
    }))
    const value = res.Item?.value as Record<string, string> | undefined
    for (const [name, address] of Object.entries(value ?? {})) {
      if (typeof address === 'string') map.set(address, name)
    }
  } catch { /* badges are cosmetic */ }
  return map
}
