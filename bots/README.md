# Eigenthrope Observer Bots

Two automated in-character observers — **vesper_null** and **amber_drift** — that
read the story, post reactions in Discord, vote on-chain via XRPL, and maintain
public working theories shown on the site's `/observers` page.

## Architecture

- **Single Node.js process** (this package) on Fly.io: two discord.js Gateway
  clients + a DynamoDB-backed scheduler polled every 60s.
- **Durable scheduling in DynamoDB, not SQS.** The briefing suggested SQS delay
  queues, but SQS message timers cap at 15 minutes — they can't carry the 2–4h
  delays this design needs. Instead, `pending_post` records live on each
  character's state item in `eigenthrope_config`; the poller executes them when
  due and claims them atomically (conditional update), so schedules survive
  restarts and can't double-fire.
- **Triggers** are written by the Next.js admin routes:
  - `/api/admin/announce` (episode open) → schedules vesper_null in 2–4h
  - `/api/cron/close-choice-point` (vote close) → schedules vesper_null in 2–4h
  - `/api/admin/reset` and `/api/admin/reset-game` (voting reset, used a lot
    during testing) → schedules vesper_null in 2–4h with trigger `game_reset`
  - When vesper_null posts, the bot process schedules amber_drift 30–60min later.
- **One Claude call per post** (`claude-sonnet-4-6`, structured output): returns
  post text + vote choice + updated working theory in a single response.
- **Votes** are 1-drop XRPL Payments to the vault with the same memo format as
  player votes (SourceTag 2606230005 on every tx). Wallet seeds come from AWS
  Secrets Manager at vote time — never from env or disk.
- **Reset-aware voting, not reset-aware memory.** The vote-guard tag
  (`last_voted`) is `${choice_point}:rv${reset_version}` — since a reset bumps
  `reset_version`, the same choice_point automatically becomes votable again
  without any special-casing. Character memory (working theory, post history)
  is deliberately **not** cleared on reset — bots keep their narrative
  continuity across test resets.
- **@mentions** get an immediate in-character reply (2-min per-bot cooldown,
  bot-authored messages ignored to prevent loops). No vote on mention replies.
- **Test mode** — a master switch on `/admin` (`test_mode` in `eigenthrope_config`,
  toggled via `/api/admin/test-mode`). When on: vesper_null's delay drops to
  1–3min (from 2–4h) and amber_drift's drops to 30–90s (from 30–60min), and the
  site's dev banner becomes visible to warn visitors the story may reset. Both
  `lib/botTriggers.ts` (Next.js) and `bots/src/poster.ts` read the flag fresh
  each time they schedule a post, so toggling takes effect on the next
  scheduled reaction — no redeploy needed.

### Character roster

Characters live in a single array in `src/characters.ts` (`CHARACTERS`), not a
hardcoded type. **To add a bot: add one entry (`name`, `weight`, `brief`) and
set its two env vars** — everything else (Discord client, XRPL voting,
DynamoDB state, scheduler) derives from `name` automatically:

```
name: "new_bot"  →  NEW_BOT_DISCORD_TOKEN, NEW_BOT_WALLET_SECRET
```

The `CharacterName` type is inferred from the array, so TypeScript will flag
every place a new name needs handling. The one thing that does *not*
generalize automatically: the vesper_null → amber_drift response chain in
`poster.ts` (who reacts to whom, and when) is a deliberate two-character
design — a third character needs that chain shape decided explicitly, it
won't just appear from adding a roster entry.

### Character state (DynamoDB `eigenthrope_config`)

```
key: character:vesper_null | character:amber_drift
{
  working_theory: string          // public, shown on /observers
  post_history: [{text, at, trigger}]  // last 50 verbatim
  history_summary: string         // rolling summary of older posts
  last_posted_at: ISO timestamp
  pending_post: { scheduled_for, trigger, context?, game_which? }
  last_voted: "U002:E01:CP1:rv0"  // double-vote guard
}
```

The prompt only ever includes player-visible data (story text from S3, chapter
record, channel messages, the bot's own state). `behavioral_profile` is
internal scoring and is never read.

## Setup checklist

1. **Discord applications** — create two apps in the
   [Developer Portal](https://discord.com/developers/applications), add a Bot to
   each, enable the **Message Content** privileged intent, copy the tokens.
   Invite both to the server with View Channel / Send Messages / Read Message
   History permissions on the game channel.
2. **XRPL wallets** — fund two wallets (a few XRP each for reserves + fees).
   Store each seed in AWS Secrets Manager (raw string or `{"seed": "s..."}`)
   and put the *secret names* in `VESPER_NULL_WALLET_SECRET` /
   `AMBER_DRIFT_WALLET_SECRET`.
3. **Character briefs** — `src/characters.ts` contains DRAFT briefs marked
   `TODO(briefs)`. Replace before the first live run.
4. **Env vars** — copy `.env.example`; on Fly, set them with
   `fly secrets set KEY=value`. Double-check `EIGENTHROPE_VAULT_ADDRESS`
   character-for-character (XRPL addresses are case-sensitive).
5. **Deploy** — `fly launch --no-deploy` (reuses `fly.toml`), `fly secrets set …`,
   `fly deploy`. Keep exactly **1 machine** (`fly scale count 1`); the atomic
   claim tolerates more, but one Gateway session per token is the clean setup.

## Local development

```sh
npm install
cp .env.example .env   # fill in
npx tsx --env-file=.env src/index.ts
```

## End-to-end test

1. Point `EIGENTHROPE_CHANNEL_ID` at a private test channel.
2. Flip **Test Mode: ON** at the top of `/admin` — this drops vesper_null's
   reaction delay to 1–3min and amber_drift's to 30–90s, and turns on the
   public dev banner. Turn it back off when you're done testing.
3. Activate a test episode in `/admin`, then hit **Announce** — this schedules
   vesper_null's reaction.
4. Confirm: vesper posts → vote tx appears on the vault account (check the memo
   decodes correctly and the SourceTag is present) → amber_drift responds →
   `/observers` shows both updated theories.
5. @mention each bot and confirm an in-character reply.
6. Try **Reset Chapter** / **Reset Game** on `/admin` — confirm both bots react
   and vote again (the `game_reset` trigger), and that a reset announcement
   posts to the Discord webhook channel.
