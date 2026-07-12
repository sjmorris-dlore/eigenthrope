import { startBots } from './discordBots.js'
import { startScheduler } from './scheduler.js'
import { executePost } from './poster.js'
import { CHARACTERS } from './characters.js'
import { preflightWallet } from './xrplVote.js'
import { publishBotAddresses } from './artifacts.js'
import { getActiveChoicePoint, getResetVersion, getTestMode } from './story.js'
import { CLAUDE_MODEL, STORIES_BUCKET, STORY_CHANNEL_ID, THEORIES_CHANNEL_ID, vaultAddress } from './config.js'

/**
 * Boot-time diagnostics: log the game state the bots see and derive each
 * wallet from Secrets Manager now, so a bad secret, IAM permission, or
 * mismatched address surfaces immediately instead of during the first vote.
 * Non-fatal — Discord posting works without wallets, so warn and continue.
 */
async function preflight(): Promise<void> {
  try {
    const [activeCp, rv, testMode] = await Promise.all([
      getActiveChoicePoint(), getResetVersion(), getTestMode(),
    ])
    console.log(`[preflight] game: active=${activeCp ?? '(none)'} rv=${rv} test_mode=${testMode ? 'ON' : 'off'}`)
    console.log(`[preflight] story-channel=${STORY_CHANNEL_ID()} theories-channel=${THEORIES_CHANNEL_ID() || '(unset — theory posts go to story channel)'} model=${CLAUDE_MODEL} bucket=${STORIES_BUCKET || '(unset!)'} vault=${vaultAddress()}`)
  } catch (err) {
    console.error('[preflight] failed to read game config from DynamoDB:', err)
  }

  const addresses: Record<string, string> = {}
  for (const character of CHARACTERS) {
    try {
      const address = await preflightWallet(character)
      addresses[character.name] = address
      console.log(`[preflight] ${character.name} wallet OK: ${address} — verify this matches the funded wallet in Xaman`)
    } catch (err) {
      console.error(`[preflight] ${character.name} wallet FAILED (votes will not work):`, err instanceof Error ? err.message : err)
    }
  }

  // Registers the bots with the game side: the mint Lambda uses this list to
  // keep bots out of the winner-NFT tier whenever humans are in it.
  if (Object.keys(addresses).length > 0) {
    try {
      await publishBotAddresses(addresses)
    } catch (err) {
      console.error('[preflight] failed to publish bot addresses:', err)
    }
  }
}

async function main(): Promise<void> {
  await preflight()

  await startBots(async (character, message) => {
    await executePost(character, {
      trigger: 'mention',
      triggerContext: `${message.author.username}: ${message.cleanContent}`,
      replyTo: message,
    })
  })

  startScheduler()
  console.log('[bots] eigenthrope observers online')
}

main().catch((err) => {
  console.error('[bots] fatal:', err)
  process.exit(1)
})
