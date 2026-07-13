import { GetCommand, UpdateCommand, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb'
import { dynamo } from '@/lib/dynamo'
import { getResetVersion } from '@/lib/config'
import { postDiscord, chapterClosedEmbed } from '@/lib/discord'
import { scheduleBotReaction } from '@/lib/botTriggers'
import { fetchVaultTransactions, getLiveWeights } from '@/lib/resonance'
import { signatureGlyphPoints } from '@/lib/signature'
import type { ChapterData } from '@/app/api/chapter/route'
import type { Clue } from '@/lib/clues'
import { emptyProfile, accumulateWeights } from '@/lib/behavioral'
import type { BehavioralProfile } from '@/lib/behavioral'

const MIN_YIELD = 0.05
const MAX_YIELD = 0.25

function computeYield(p: number): number {
  const t = Math.max(0, Math.min(1, (p - 0.5) * 2))
  return MIN_YIELD + (MAX_YIELD - MIN_YIELD) * (1 - t)
}

function fromHex(hex: string) {
  return Buffer.from(hex, 'hex').toString('utf8')
}

/**
 * Final tally with CLOSE-TIME weights: memos decide each voter's choice, but
 * weight comes from what the voter holds at the moment of closing. Trading
 * artifacts therefore matters until the deadline — and one artifact can only
 * ever boost one voter per round, since at close it sits in a single wallet.
 * The weight in the vote memo is a display-time estimate only.
 */
async function computeFinalTally(
  vaultAddress: string,
  universe: string,
  chapter: string,
  cp: string,
  resetVersion: number
): Promise<{ counts: Record<string, number>; weights: Record<string, number> }> {
  const transactions = await fetchVaultTransactions(vaultAddress, 200)
  const latestChoice: Record<string, string> = {}
  const seen = new Set<string>()

  for (const entry of transactions) {
    const tx = (entry as Record<string, unknown>).tx_json ??
                (entry as Record<string, unknown>).tx
    if (!tx || (tx as Record<string, unknown>).TransactionType !== 'Payment') continue
    const sender = ((tx as Record<string, unknown>).Account as string)?.trim()
    if (!sender || seen.has(sender)) continue
    const memos = (tx as Record<string, unknown>).Memos as Array<{ Memo: { MemoData?: string } }> | undefined
    if (!memos) continue
    for (const { Memo } of memos) {
      if (!Memo.MemoData) continue
      try {
        const vote = JSON.parse(fromHex(Memo.MemoData))
        if (
          vote.universe === universe &&
          vote.chapter === chapter &&
          vote.choice_point === cp &&
          (vote.rv ?? 0) === resetVersion
        ) {
          latestChoice[sender] = vote.choice
          seen.add(sender)
        }
      } catch { /* skip */ }
    }
  }

  const weights = await getLiveWeights(Object.keys(latestChoice), vaultAddress, transactions)
  const counts: Record<string, number> = {}
  for (const [sender, choice] of Object.entries(latestChoice)) {
    counts[choice] = (counts[choice] ?? 0) + (weights[sender] ?? 1)
  }
  return { counts, weights }
}

export async function GET(request: Request) {
  // Verify Vercel cron secret
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const force = new URL(request.url).searchParams.get('force') === 'true'

  const vaultAddress = process.env.EIGENTHROPE_VAULT_ADDRESS?.trim()
  if (!vaultAddress) {
    return Response.json({ error: 'EIGENTHROPE_VAULT_ADDRESS not set' }, { status: 500 })
  }

  const configItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_config',
    Key: { key: 'active_choice_point' },
  }))
  if (!configItem.Item) {
    return Response.json({ skipped: 'No active choice point' })
  }

  const choicePoint = configItem.Item.value as string
  const chapterItem = await dynamo.send(new GetCommand({
    TableName: 'eigenthrope_chapters',
    Key: { choice_point: choicePoint },
  }))

  const chapter = chapterItem.Item as ChapterData | undefined
  if (!chapter) return Response.json({ skipped: 'Chapter not found' })
  if (chapter.status === 'closed') return Response.json({ skipped: 'Already closed' })
  if (!chapter.voting_closes_at) return Response.json({ skipped: 'No deadline set' })
  if (!force && new Date(chapter.voting_closes_at) > new Date()) {
    return Response.json({ skipped: 'Deadline not yet reached', closes_at: chapter.voting_closes_at })
  }

  // Deadline passed — compute final tally and close
  // Use stored universe/chapter fields, not key segments — they may differ after migrations.
  const cp = choicePoint.split(':')[2]
  const resetVersion = await getResetVersion()
  let { counts: finalTally, weights: finalWeights } =
    await computeFinalTally(vaultAddress, chapter.universe, chapter.chapter, cp, resetVersion)

  let total = Object.values(finalTally).reduce((a, b) => a + b, 0)
  if (total === 0) {
    console.error(
      `[close-chapter] XRPL returned 0 matching votes for ${choicePoint} ` +
      `(universe=${chapter.universe} chapter=${chapter.chapter} cp=${cp} rv=${resetVersion}). ` +
      `Retrying in 5s...`
    )
    await new Promise(r => setTimeout(r, 5000))
    ;({ counts: finalTally, weights: finalWeights } =
      await computeFinalTally(vaultAddress, chapter.universe, chapter.chapter, cp, resetVersion))
    total = Object.values(finalTally).reduce((a, b) => a + b, 0)
    if (total === 0) {
      console.error(`[close-chapter] Retry also returned 0 votes. Proceeding with empty tally.`)
    } else {
      console.log(`[close-chapter] Retry succeeded — found ${total} vote(s).`)
    }
  }
  const winningChoice = total > 0
    ? Object.entries(finalTally).sort((a, b) => b[1] - a[1])[0][0]
    : null
  const winnerWeight = winningChoice ? (finalTally[winningChoice] ?? 0) : 0
  const yieldPct = total > 0 ? computeYield(winnerWeight / total) : MAX_YIELD

  await dynamo.send(new UpdateCommand({
    TableName: 'eigenthrope_chapters',
    Key: { choice_point: choicePoint },
    UpdateExpression: `SET #s = :closed, closed_at = :now, winning_choice = :wc,
                       final_tally = :ft, final_weights = :fw, final_yield_pct = :yp`,
    ConditionExpression: '#s = :open',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: {
      ':closed': 'closed',
      ':open': 'open',
      ':now': new Date().toISOString(),
      ':wc': winningChoice,
      ':ft': finalTally,
      ':fw': finalWeights, // close-time per-voter weights — the mint winner tier sorts by these
      ':yp': yieldPct,
    },
  }))

  // Accumulate behavioral weights from winning choice into running profile
  if (winningChoice) {
    const weights = chapter.choices?.[winningChoice]?.behavioral_weights
    if (weights && Object.keys(weights).length > 0) {
      const profileItem = await dynamo.send(new GetCommand({
        TableName: 'eigenthrope_config',
        Key: { key: 'behavioral_profile' },
      }))
      const existing = (profileItem.Item?.value ?? {}) as Partial<BehavioralProfile>
      const merged = accumulateWeights({ ...emptyProfile(), ...existing }, weights)
      await dynamo.send(new PutCommand({
        TableName: 'eigenthrope_config',
        Item: { key: 'behavioral_profile', value: merged },
      }))
    }
  }

  // Auto-discover clues triggered by this branch outcome
  if (winningChoice) {
    const cluesResult = await dynamo.send(new ScanCommand({ TableName: 'eigenthrope_clues' }))
    const now = new Date().toISOString()
    const [universe] = choicePoint.split(':')
    await Promise.all(
      ((cluesResult.Items ?? []) as Clue[])
        .filter(c =>
          !c.discovered &&
          (c.reveal_triggers ?? []).some(
            t => t.choice_point === choicePoint && t.winning_choice === winningChoice
          )
        )
        .map(c =>
          dynamo.send(new PutCommand({
            TableName: 'eigenthrope_clues',
            Item: {
              ...c,
              discovered: true,
              discovered_at: now,
              discovered_in_universe: universe,
              discovered_in_branch: choicePoint,
            },
          }))
        )
    )
  }

  // Snapshot the field's star as it stands after this close (post-accumulation)
  // — the archive shows the community's shape drifting chapter by chapter.
  // Points only; the profile itself stays secret.
  try {
    const fieldProfileItem = await dynamo.send(new GetCommand({
      TableName: 'eigenthrope_config',
      Key: { key: 'behavioral_profile' },
    }))
    const fieldProfile = {
      ...emptyProfile(),
      ...((fieldProfileItem.Item?.value ?? {}) as Partial<BehavioralProfile>),
    }
    await dynamo.send(new UpdateCommand({
      TableName: 'eigenthrope_chapters',
      Key: { choice_point: choicePoint },
      UpdateExpression: 'SET field_glyph = :g',
      ExpressionAttributeValues: { ':g': signatureGlyphPoints(fieldProfile) },
    }))
  } catch (err) {
    console.error('[close-chapter] field glyph snapshot failed (cosmetic):', err)
  }

  // No auto-advance: the game stays on the closed chapter until the admin
  // hits "Advance to Next Episode" (/api/admin/advance) — the gap is where
  // NFTs get minted and distributed, so weights settle before the next vote.
  await dynamo.send(new PutCommand({
    TableName: 'eigenthrope_config',
    Item: { key: 'previous_choice_point', value: choicePoint },
  }))

  // Schedule the observer bots' in-character reaction (vesper_null in 2–4h)
  await scheduleBotReaction('vote_close')

  const winningLabel = winningChoice ? chapter.choices?.[winningChoice]?.label ?? null : null
  await postDiscord(chapterClosedEmbed(
    chapter.universe ?? choicePoint.split(':')[0],
    chapter.chapter_label ?? choicePoint,
    winningChoice,
    winningLabel,
    finalTally,
  ))

  return Response.json({
    closed: choicePoint,
    winning_choice: winningChoice,
    final_tally: finalTally,
    yield_pct: yieldPct,
  })
}
