# Eigenstate — Design Document

*Technical and mechanical reference — updated as architecture evolves*

---

## The Core Loop

1. A story chapter is published with a branching choice
2. Players connect their XRPL wallet and submit a vote as a transaction
3. Weighted votes determine the outcome
4. The story advances — a clue is revealed or missed, permanently
5. Eventually the universe collapses and a new one begins
6. Player participation weights carry forward across universes

---

## Player Identity & Registration

- Players connect via **Xaman** wallet (mobile-friendly, handles transaction signing)
- Wallet address = player identity
- No email, no signup form, no password
- First wallet connection = genesis (participation history begins from zero)
- Identity is self-sovereign — Eigenstate never holds keys

---

## Participation & Vote Weight

### The Core Principle
Influence is earned through participation, not purchased or inherited. This is a judgment economy, not a follower economy.

### How Weight Accumulates
- Every player begins with equal base weight
- Each vote cast increments participation history
- Weight is a function of total votes cast across all universes
- Long-term players carry more narrative gravity than newcomers

### Why Not Social Media Follower Count?
- Follower counts are trivially faked via bot farms
- Engagement rate is a better signal but still platform-dependent and API-gated
- On-chain participation history is verifiable, platform-agnostic, and trustless
- Keeps the entire system self-contained on XRPL

### Thematic Framing
Player weight should be surfaced in the UI under a mythologically consistent name. Candidates:
- Resonance
- Observation Strength
- Eigenweight
- Narrative Gravity

Players are not accumulating voting power. They are becoming stronger observers.

---

## Voting Mechanics

### Vote Submission
Each vote is an XRPL Payment transaction with a structured Memo containing:

```
{
  "universe": "U001",
  "chapter": "C01",
  "choice_point": "CP1",
  "choice": "A",
  "weight": 1.0
}
```

- `universe` — identifier for the current universe
- `chapter` — chapter within the universe
- `choice_point` — specific decision being voted on
- `choice` — the option selected (A, B, etc.)
- `weight` — player's participation weight at time of vote

### On-Chain Transparency
Every vote is permanently recorded on the XRP Ledger. The full path of every universe — every choice the community made, every clue discovered or missed, every collapse — is readable from the chain. Nothing is hidden. Nothing can be altered retroactively.

### Vote Tallying
- Backend reads submitted transactions for the current choice point
- Applies participation weights
- Determines outcome when either a threshold or timer condition is met
- Updates story state in database
- Marks choice point as closed

---

## The Clue Pool

### Structure
The deeper mythology is revealed through discoverable clues embedded in story branches. Community choices determine which clues surface.

- Once a clue is discovered it is **permanently removed** from the pool
- It becomes part of the community's accumulated knowledge
- It may be referenced in future universes but is never re-discoverable
- The pool itself is hidden — players do not know its size or contents

### Why Hidden?
A known pool reveals the shape of the mystery through its gaps. Players would reverse-engineer the mythology from missing entries. The hidden pool creates an archaeological experience — the community doesn't just fill in blanks, they figure out what the blanks even are.

### Clue Dependencies
Some deeper clues only become accessible after prerequisite clues have been discovered. This creates a natural pacing mechanism and rewards long-term community knowledge.

---

## Universe Lifecycle

### A Universe Ends When:
- A collapse condition is met (community makes enough wrong turns)
- The story reaches its natural conclusion for that universe

### Collapse Is Canon
A collapse is not a failure state. It is built into the mythology — the Eigenthropes slip to a new eigenstate, relationships reset, a new crisis emerges. Players carry their accumulated knowledge forward. Characters do not.

### What Carries Forward
- Player participation weights (accumulate across all universes)
- Discovered clues (permanently in the community's knowledge base)
- The on-chain record of all choices made

### What Resets
- Story state
- Character relationships and memory
- Available clue branches (new universe, new pool — but previously discovered clues never return)

---

## Chapter Design Rule

Every chapter must advance all three narrative scales:

| Scale | Description | Example |
|---|---|---|
| Immediate | Something happens in the current narrative | The Hero escapes |
| Mysterious | Something strange is revealed | The Woman knows a detail she shouldn't |
| Mythological | Something advances the larger cosmology | The Antagonist reacts to an object from a previous universe |

A chapter advancing only one scale loses player investment. All three keeps players engaged in both the current story and the larger mystery.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (React) |
| Hosting | Vercel |
| Domain | eigenstate.sjmorriswrites.com |
| DNS | Squarespace CNAME → Vercel |
| Wallet connection | Xaman |
| Blockchain | XRP Ledger (mainnet) |
| Vote recording | XRPL Payment transactions with Memo |
| Application state | DynamoDB (AWS) |
| Backend logic | AWS Lambda + Vercel serverless functions |
| Language | TypeScript |
| XRPL library | xrpl.js |

---

## Infrastructure Notes

- DynamoDB is existing infrastructure — same AWS account as Growthbot/Adsbot
- Story state lives in DynamoDB; the chain is the audit trail, not the source of truth for the UI
- Backend vote tallying can run as a Lambda on a timer or triggered by transaction webhook
- All campaigns/universes default to a defined source tag for hackathon leaderboard tracking

---

## Repository

**GitHub:** https://github.com/sjmorris-dlore/eigenstate

### File Structure (planned)
```
/
├── README.md           — Project overview and pitch
├── DESIGN.md           — This document
├── STORY.md            — Narrative and story development
├── /app                — Next.js application
├── /lambda             — AWS Lambda functions
└── /scripts            — Utility scripts
```

---

## Hackathon Requirements Checklist

- [ ] Source tag assigned by XRPL Commons — add to all mainnet transactions
- [ ] Mainnet validation meeting booked
- [ ] At least one mainnet transaction with source tag recorded
- [ ] Demo video (YouTube, Vimeo, or Loom)
- [ ] Public GitHub repository URL submitted
- [ ] Short description (200 chars max)
- [ ] Full description (5000 chars max)
- [ ] Technical description (1000 chars max)
- [ ] Submission deadline: **July 23, 2026**

---

## Open Technical Questions

1. Vote advancement trigger — timer-based or vote-threshold-based?
2. How many choice points per chapter?
3. Minimum participation weight for a vote to count?
4. How to handle simultaneous votes during tallying (race conditions)
5. Whether to expose a public API for community-built tools (wikis, trackers)
6. Mobile experience — Xaman deep links vs. QR code flow

---

*Last updated: June 24, 2026*
