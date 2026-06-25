# Eigenthrope — Game Master Runbook

*Operational reference for running the game. For design and mechanics, see DESIGN.md.*

---

## Environment Variables

These must be set in both `.env.local` (local scripts) and Vercel (deployed app).

| Variable | Description |
|---|---|
| `EIGENTHROPE_VAULT_ADDRESS` | XRPL wallet that receives all vote transactions |
| `EIGENTHROPE_VAULT_SECRET` | Seed/secret for the vault wallet — used by minting scripts only, never deployed to Vercel |
| `XAMAN_API_KEY` | From apps.xaman.dev — public, used on the frontend |
| `NEXT_PUBLIC_XAMAN_API_KEY` | Same key, exposed to the browser for wallet connection |
| `XAMAN_API_SECRET` | From apps.xaman.dev — secret, server-side only |
| `AWS_ACCESS_KEY_ID` | DynamoDB access |
| `AWS_SECRET_ACCESS_KEY` | DynamoDB access |
| `CRON_SECRET` | Any string you choose — Vercel sends it to authenticate the hourly cron |
| `EIGENTHROPE_S3_BUCKET` | S3 bucket name for story markdown files (e.g. `eigenthrope-stories-sjm`) |

> `EIGENTHROPE_VAULT_SECRET` should never be added to Vercel. It is only needed locally for the minting and closing scripts.

---

## One-Time Setup

```bash
# Create all DynamoDB tables
node scripts/create-tables.mjs
node scripts/create-chapter-tables.mjs
node scripts/create-artifact-table.mjs

# Create S3 bucket for story files (set EIGENTHROPE_S3_BUCKET in .env.local first)
node scripts/create-s3-bucket.mjs
```

---

## The Weekly Beat

Each story beat runs for 7 days: **5 days of voting** + **2 days** for the author to write the outcome and next chapter.

### Day 0 — Open a Choice Point

1. Seed the chapter (sets voting clock, prompt, and choices):

```bash
node scripts/seed-chapter-1.mjs
```

2. Upload the pre-vote story text so players see the narrative immediately:

```bash
node scripts/upload-story.mjs \
  --choice-point U001:C01:CP1 \
  --file story-files/U001-C01-story.md
```

The story file should cover everything up to the branching moment — prologue, action, context. The voting prompt and choice buttons come from DynamoDB.

### Days 1–5 — Voting Open

Nothing to do. The app handles voting, tallying, and the waveform display automatically. The Vercel cron checks hourly and closes the choice point when `voting_closes_at` passes.

Monitor if you want:
- Watch the live tally at eigenthrope.sjmorriswrites.com
- Check DynamoDB `eigenthrope_chapters` to see vote counts

### Day 5 — Choice Point Closes

The cron closes it automatically. If you need to close it early:

```bash
node scripts/close-choice-point.mjs
```

This computes the final tally from the chain, records the winning choice, and calculates the quantum yield percentage.

### Day 5 — Distribute Artifacts

After close, generate the artifact image (AI-generated, one per choice point), then run:

```bash
node scripts/mint-artifact.mjs \
  --choice-point U001:C01:CP1 \
  --uri https://your-image-url.com/artifact.png
```

The script reads the final tally, selects winners at the quantum yield rate, mints one NFT per winner, and creates a 0-XRP claim offer for each. Winners see the "Claim Artifact" banner in the app for 7 days.

### Days 5–7 — Write the Outcome and Next Chapter

You have 2 days. Use the winning choice to:
1. Write the outcome story (what happened as a result of the vote)
2. Publish it so players see the narrative continuation while voting is closed:

```bash
node scripts/publish-outcome.mjs \
  --choice-point U001:C01:CP1 \
  --file story-files/U001-C01-outcome.md
```

3. Write the next chapter's pre-vote story (prologue through the new branching moment)
4. Seed the next chapter on Day 7

### Day 7 — Open the Next Choice Point

```bash
node scripts/seed-chapter-2.mjs   # (or whichever chapter is next)
node scripts/upload-story.mjs \
  --choice-point U001:C02:CP1 \
  --file story-files/U001-C02-story.md
```

---

## Extending the Deadline

If you need more time for any reason:

```bash
node scripts/extend-vote.mjs --days 2
```

This pushes both `voting_closes_at` and `next_chapter_due_at` forward by 2 days. The countdown in the UI updates immediately. The cron picks up the new deadline automatically.

---

## Cancelling Unclaimed Artifact Offers

Run weekly, or after each beat, to cancel expired NFT offers and free up the vault wallet:

```bash
node scripts/cancel-expired-offers.mjs
```

---

## End-of-Universe Reset

When a universe ends and you want to start fresh:

```bash
# 1. Close the final choice point if still open
node scripts/close-choice-point.mjs

# 2. Clear all tables
node scripts/reset.mjs --yes

# 3. Seed the first chapter of the new universe
node scripts/seed-universe-2-chapter-1.mjs
```

Player Resonance is not stored in DynamoDB — it is computed live from the vault wallet's transaction history. It carries forward automatically as long as you use the same vault wallet across universes. If you switch vault wallets, Resonance resets.

---

## Test Run → Production Reset

Use a separate vault wallet for any test run so on-chain votes don't contaminate the production game.

**Before the test run:**
1. Create a new XRPL wallet in Xaman and fund it with 1 XRP
2. Set `EIGENTHROPE_VAULT_ADDRESS` in Vercel to the test wallet address
3. Seed a test chapter

**After the test run:**
```bash
# Close and clear
node scripts/close-choice-point.mjs
node scripts/reset.mjs --yes
```

Then in Vercel:
- Change `EIGENTHROPE_VAULT_ADDRESS` to the production vault wallet address

Then locally:
```bash
# Seed the real Chapter 1
node scripts/seed-chapter-1.mjs
```

---

## Script Reference

| Script | Purpose |
|---|---|
| `seed-chapter-1.mjs` | Seeds a chapter and sets it as the active choice point |
| `upload-story.mjs --choice-point X --file Y` | Uploads pre-vote story markdown to S3 and sets story_key |
| `publish-outcome.mjs --choice-point X --file Y` | Uploads post-vote outcome markdown to S3 and sets outcome_key |
| `close-choice-point.mjs` | Manually closes the active choice point |
| `extend-vote.mjs --days N` | Extends the voting deadline by N days |
| `mint-artifact.mjs --choice-point X --uri Y` | Mints and distributes NFT artifacts after a close |
| `cancel-expired-offers.mjs` | Cancels unclaimed NFT offers past their 7-day window |
| `reset.mjs --yes` | Clears all DynamoDB tables |
| `create-tables.mjs` | Creates `eigenthrope_tallies` table |
| `create-chapter-tables.mjs` | Creates `eigenthrope_chapters` and `eigenthrope_config` tables |
| `create-artifact-table.mjs` | Creates `eigenthrope_artifacts` table |
| `create-s3-bucket.mjs` | Creates and configures the S3 story bucket |

---

## Hackathon Checklist

- [ ] Source tag 2606230005 on all mainnet transactions ✓
- [ ] Mainnet validation meeting booked
- [ ] At least one mainnet transaction with source tag recorded ✓
- [ ] Demo video (YouTube, Vimeo, or Loom)
- [ ] Public GitHub repository URL submitted
- [ ] Short description (200 chars max)
- [ ] Full description (5000 chars max)
- [ ] Technical description (1000 chars max)
- [ ] Submission deadline: **July 23, 2026**

---

*Last updated: June 25, 2026*
