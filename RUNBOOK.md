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

> `EIGENTHROPE_VAULT_SECRET` should never be added to Vercel. It is only needed locally for the minting and closing scripts.

---

## One-Time Setup

```bash
# Create all DynamoDB tables
node scripts/create-tables.mjs
node scripts/create-chapter-tables.mjs
node scripts/create-artifact-table.mjs
```

---

## The Weekly Beat

Each story beat runs for 7 days: 6 days of voting, 1 day for the author to write and publish the next chapter.

### Day 0 — Open a Choice Point

Write the chapter content into `scripts/seed-chapter-1.mjs` (or a copy for subsequent chapters), then run:

```bash
node scripts/seed-chapter-1.mjs
```

This sets the chapter live and starts the 6-day voting clock. Players immediately see the prompt and can vote.

### Days 1–6 — Voting Open

Nothing to do. The app handles voting, tallying, and the waveform display automatically. The Vercel cron checks hourly and closes the choice point when `voting_closes_at` passes.

Monitor if you want:
- Watch the tally at eigenthrope.sjmorriswrites.com
- Check DynamoDB `eigenthrope_chapters` to see vote counts coming in

### Day 6 — Choice Point Closes

The cron closes it automatically. If you need to close it early:

```bash
node scripts/close-choice-point.mjs
```

This computes the final tally from the chain, records the winning choice, and calculates the quantum yield percentage.

### Day 6 — Distribute Artifacts

After the choice point is closed, generate the artifact image (AI-generated, one per choice point), then run:

```bash
node scripts/mint-artifact.mjs \
  --choice-point U001:C01:CP1 \
  --uri https://your-image-url.com/artifact.png
```

The script reads the final tally, selects winners at the quantum yield rate, mints one NFT per winner, and creates a 0-XRP claim offer for each. Winners see the "Claim Artifact" banner in the app for 7 days.

### Day 6–7 — Write the Next Chapter

Review the outcome:
- Which choice won
- What the final tally looked like
- What clues or facts this unlocks (see DESIGN.md — Immutable Story Facts)

Write the next chapter, update the seed script, and seed it on Day 7.

### Day 7 — Open the Next Choice Point

```bash
node scripts/seed-chapter-2.mjs   # (or whichever chapter is next)
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
| `close-choice-point.mjs` | Manually closes the active choice point |
| `extend-vote.mjs --days N` | Extends the voting deadline by N days |
| `mint-artifact.mjs --choice-point X --uri Y` | Mints and distributes NFT artifacts after a close |
| `cancel-expired-offers.mjs` | Cancels unclaimed NFT offers past their 7-day window |
| `reset.mjs --yes` | Clears all DynamoDB tables |
| `create-tables.mjs` | Creates `eigenthrope_tallies` table |
| `create-chapter-tables.mjs` | Creates `eigenthrope_chapters` and `eigenthrope_config` tables |
| `create-artifact-table.mjs` | Creates `eigenthrope_artifacts` table |

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
