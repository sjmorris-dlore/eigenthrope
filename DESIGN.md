# Eigenstate — Design Document

*Technical and mechanical reference — updated as architecture evolves*

---

## The Core Loop

1. A story chapter is published with a branching choice
2. Players connect their XRPL wallet and submit a vote as a transaction
3. Weighted votes determine the outcome
4. The selected outcome updates universe state and community knowledge state
5. The next chapter is authored from the current state, not from a prewritten branch tree
6. Eventually the universe collapses and a new one begins
7. Player participation weights and accumulated knowledge carry forward across universes

---

## Authoring Model: State-Driven, Not Branch-Tree

Eigenthrope should not be authored as a traditional branching tree.

Traditional CYOA structure creates exponential writing burden:

```
Chapter 1
├── Choice A
│   ├── Chapter 2A
│   └── Chapter 2B
└── Choice B
    ├── Chapter 2C
    └── Chapter 2D
```

Eigenthrope should instead work as a **state-driven mystery engine**.

Each vote updates the current state of the universe. The author then writes the next chapter based on that state.

The question is not:

> Which branch are we on?

The question is:

> Given what happened, what is the most interesting next chapter?

This keeps the game sustainable while preserving meaningful consequences.

### Current Reality, Not Branch Path

The backend should track the current state of reality, not an ever-expanding branch tree.

Example:

```
Universe: U001 — 1963 Bank Robbery

Immutable Facts:
- Hero chased the fleeing man
- Antagonist escaped
- Archive remained unsecured
- Woman stayed at the scene

Knowledge State:
- Antagonist predicted Hero: true
- Archive target identified: false
- Photograph thread: state 1
- Woman anomaly thread: state 0
```

The next chapter is written from this state.

The exact path that produced the state remains available in the archive and on-chain voting history, but the author does not need to maintain a separate branch for every possible route.

### Two Kinds of State

Eigenthrope should distinguish between **story facts** and **community knowledge**.

#### Immutable Story Facts

Facts are things that happened in the current universe.

Examples:

- The Hero chased the Antagonist
- The Woman saw the photograph
- The vault was opened
- The police blamed the Hero
- The Antagonist escaped with the file

Facts are authored consequences of winning choices. They shape the current universe.

#### Community Knowledge State

Knowledge state represents what the community has learned across all universes.

Examples:

- `CLUE_PHOTOGRAPH_001` advanced to state 2
- `THREAD_WOMAN_ANOMALY` discovered
- `THREAD_ANTAGONIST_PREDICTION` active
- `THREAD_OBSERVER` dormant

Knowledge state carries forward across universes and is the real long-term progression system.

### Chapter Authoring Workflow

After each vote resolves, the authoring workflow should be:

1. Record the winning choice on-chain and in application state
2. Update immutable facts for the current universe
3. Update any clue or mystery-thread states revealed by the outcome
4. Review current universe facts and accumulated knowledge
5. Write the next chapter based on the current state
6. Present the next meaningful choice

This is closer to running a tabletop RPG campaign than writing a fixed branching novel.

The author understands:

- the characters
- the current universe
- the hidden cosmology
- the mystery threads
- the consequences of prior votes

The community creates the plot through decisions.

### Design Principle

Eigenthrope requires **more planning of the world** and **less planning of the plot**.

The cosmology, mystery threads, major clue states, and endgame should be planned.

Individual chapter paths should remain flexible and reactive.

The story is discovered through play.

---

## Player Identity & Registration

- Players connect via **Xaman** wallet (mobile-friendly, handles transaction signing)
- Wallet address = player identity
- No email, no signup form, no password
- First wallet connection = genesis (participation history begins from zero)
- Identity is self-sovereign — Eigenstate never holds keys

---

## Wallet Connection Value Proposition (Design Consideration)

Connecting a Xaman wallet requires downloading a mobile app and acquiring a small amount of XRP (~1 XRP for reserve). This is meaningful friction. The connection needs to deliver enough value that players feel it was worth the effort.

### What the Wallet Gives You (Beyond Voting)

**Identity across universes.** Your wallet address is your persistent Observer identity. It doesn't reset when a universe collapses. Your history — every choice you made, every clue you witnessed being discovered — is readable on-chain forever. No platform can revoke it.

**Resonance score.** Your participation weight grows with every vote, compounding across universes. A wallet that has been observing since Universe 1 carries more Resonance than a new one. This is a visible, on-chain reputation that belongs entirely to the holder.

**Resonance tiers (possibility).** Thresholds could unlock cosmetic or narrative distinctions — a title, a UI treatment, access to lore that new players don't yet see. Not pay-to-win, but acknowledgment of depth of engagement.

**Discovery attribution.** When a clue is discovered, the on-chain record shows every wallet that voted for the winning path. The community collectively surfaced the clue, and each Observer's wallet is provably part of that moment. This is closer to being a co-author than a player.

**NFT artifact ownership.** If artifacts are minted at choice point close, they live in the holder's wallet — not in a platform account, not behind a login. They can be traded, held, or displayed through any XRPL-compatible tool, independent of Eigenthrope.

### The Framing

The wallet connection shouldn't be pitched as "sign in to play." It should be pitched as "claim your Observer identity." The game is happening on-chain whether or not any individual participates — connecting means making yourself part of the record.

---

## Participation & Vote Weight

### The Core Principle
Influence is earned through participation, not purchased or inherited. This is a judgment economy, not a follower economy.

### How Weight Accumulates
- Every player begins with equal base weight
- Each vote cast increments participation history
- Weight is a function of total votes cast across all universes
- Long-term players carry more Resonance than newcomers

### Why Not Social Media Follower Count?
- Follower counts are trivially faked via bot farms
- Engagement rate is a better signal but still platform-dependent and API-gated
- On-chain participation history is verifiable, platform-agnostic, and trustless
- Keeps the entire system self-contained on XRPL

### Thematic Framing
Player weight is surfaced in the UI as **Resonance**.

Players are not accumulating voting power. They are becoming stronger observers.

---

## Content Integrity (Not Yet Implemented)

### The Problem

Votes are immutable — permanently recorded on XRPL, unalterable by anyone including the game master. But the story content players are voting on lives in DynamoDB, which only the game master controls. Nothing currently prevents retroactive edits to chapter prompts, choice descriptions, or outcome framing after votes have been cast.

This is a real integrity gap. The game's central claim is that the ledger doesn't lie. That claim is undermined if what the votes refer to can be quietly changed.

### The Solution: IPFS + On-Chain Hash Commitment

When a choice point opens for voting, publish the chapter content to IPFS and record the content hash on-chain in a vault wallet transaction.

IPFS content addressing means the hash IS the file — if the content changes, the hash changes. The on-chain transaction is permanent. Players (or anyone) can verify integrity by:

1. Fetching the chapter from the app
2. Hashing it
3. Finding the chapter-open memo in the vault wallet's transaction history
4. Confirming the hashes match

The on-chain memo would be structured as:

```json
{
  "type": "chapter_open",
  "choice_point": "U001:C01:CP1",
  "ipfs": "ipfs://QmXxx..."
}
```

### Why This Matters for the Mythology

The fix is also thematically load-bearing. "The ledger doesn't lie" becomes a verifiable claim, not just a theme. The game master cannot rewrite history — the same constraint that applies to the characters applies to the author. This is worth communicating to players explicitly when implemented.

### Implementation Notes (for later)

- Requires an IPFS pinning service (Pinata free tier is sufficient; needs `PINATA_JWT` env var)
- `open-chapter.mjs` would replace the manual seed script: seeds DynamoDB, publishes to IPFS, commits hash on-chain in one step
- The artifact NFT URIs (already planned) should also point to IPFS rather than regular URLs for the same permanence reasons
- Verification could eventually be surfaced in the UI — a small "verified" indicator showing the chapter hash matches the on-chain commitment

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

### Clues as Evolving Objects

Clues are not just facts — they are *objects* with a life across universes. A physical item (a photograph, a document, a scar) can appear in multiple states depending on where and when in the multiverse the community is observing it.

**Example:** A photograph exists in Universe 1 with a face burned away. In a later universe set earlier in time, the photograph is intact — and a subsequent chapter shows the moment it was taken. The object is the same; the community's knowledge of it deepens across universes.

This creates an archaeological dynamic: the community doesn't just collect clues, they *understand* them more deeply over time.

#### Clue Status
- `dormant` — not yet reachable; prerequisites not met or universe hasn't opened the path
- `active` — available to be discovered through the right community choice
- `discovered` — found by the community; now part of accumulated knowledge

#### Clue Schema (DynamoDB: `eigenthrope_clues`)

```
PK: clue_id            e.g. "CLUE_PHOTOGRAPH_001"
- name                 "The Photograph"
- status               "dormant" | "active" | "discovered"
- state_description    Authored free text describing the object's current observed state.
                       This is what the community sees. Updated by the author as the
                       story evolves across universes.
                       e.g. "A black and white photograph of three people.
                             The face on the right has been burned away."
- appearances          Array of planned appearances (author planning tool, not exposed to players):
                       [
                         { universe, chapter, condition, state, note },
                         ...
                       ]
                       e.g. { universe: "U001", chapter: "C02",
                              condition: "choice A wins",
                              state: "burned",
                              note: "found in the Antagonist's desk" }
- prerequisite_clues   ["CLUE_DARKROOM_001"] — clues that must be discovered first
- choice_path          Which choice reveals this clue, e.g. "U001:C01:CP1:A"
- discovered_at        ISO timestamp | null
- discovered_in_universe  "U001" | null
```

#### Discovered Clues (DynamoDB: `eigenthrope_discoveries`)

Separate table — safe to expose to players. Contains only discovered clues with their current `state_description`. The hidden pool (`eigenthrope_clues`) is never queried from the frontend directly.

#### Key Design Rules
- The pool size is never revealed — players cannot know how many clues remain
- `state_description` is the author's voice; it evolves as the author writes new universe chapters
- An object's state history (burned → whole → photographed) is the narrative arc, not player-facing state machine transitions
- Prerequisite dependencies create natural pacing and reward long-term community knowledge

---

## NFT Artifacts (Possibility — Not Yet Implemented)

When a choice point closes, the story advances along one path and one artifact is revealed. That artifact could be minted as an NFT on XRPL (XLS-20 standard) and distributed to everyone who voted — winners and losers alike.

### Design Rationale

- There is **one image per choice point** — the thing that was discovered, not the thing that wasn't
- Giving losers a different image would reveal an alternate-path clue that doesn't exist in the canonical narrative
- Everyone who voted witnessed the same moment; the NFT is proof of presence, not proof of correctness
- Being right is already rewarded through **Resonance** — alignment with the outcome grows your weight for future choices

### NFT Metadata Differentiators

While the image is the same for all voters, token metadata could encode alignment:
- `aligned: true | false` — whether the holder voted for the winning choice
- `resonance_at_vote` — the holder's weight at the time they voted
- `edition` — mint order (earlier voters get lower edition numbers)

This creates provably distinct tokens sharing the same image, with the metadata as the collector's artifact.

### Trading

XRPL has a native NFT DEX — holders could trade artifacts through Xaman directly. A future marketplace view in the app could surface offer/bid state for the community's collected artifacts.

### Image Generation

Images would be AI-generated, one per choice point, authored by the game master after the outcome is determined. The image represents what the community discovered, rendered as a collectible artifact.

### Quantum Yield Mechanic

Artifact distribution rate is not fixed — it scales inversely with vote consensus, analogous to the Heisenberg Uncertainty Principle.

**The principle:** The more precisely the community pins down a state (everyone votes the same way), the less the universe yields in return. When observers genuinely diverge, reality stays uncertain longer and more artifacts crystallize from the tension.

Let `p` = winning choice's share of total weighted votes (0.5–1.0):

```
yield_pct = MIN_YIELD + (MAX_YIELD − MIN_YIELD) × (1 − 2(p − 0.5))
```

| Consensus | Yield |
|---|---|
| 50/50 split | 25% of winners (maximum) |
| 60/40 split | 20% |
| 75/25 split | 12.5% |
| 90/10 split | 5% |
| 100/0 split | 5% (floor — always some yield) |

A floor of 5% ensures even a unanimous vote produces artifacts. The mechanic rewards independent thinking over herd behavior without punishing consensus entirely.

**UI:** The Quantum State waveform display shows this live — two complementary Gaussian curves (Observer Consensus in white, Artifact Yield in amber) that trade widths as the vote split shifts. When 50/50, the yield curve is tall and narrow. When consensus is total, it flattens.

### Open Questions

- Trigger: automated on choice point close, or manual game master action?
- Who pays the mint fee? (Gas on XRPL NFTs is low but non-zero)
- Should non-voters ever receive artifacts (e.g., late joiners who missed a choice point)?
- Burn-and-exchange mechanic: could players trade artifacts to assemble a set?

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

## Chapter Structure

### One Choice Point Per Chapter

Each chapter contains exactly one choice point. Multiple choice points per chapter would force players to check back more than once per story beat, compressing the cadence in a way that feels like a chore rather than an event.

The beat structure is: players read a chapter-length narrative, cast one vote, and wait for the outcome. That's the rhythm.

### Story File Structure (S3)

Each chapter has two Markdown files stored in S3:

- **Story** (`{universe}/{chapter}/story.md`) — everything up to the branching moment: prologue, action, context. Published when the chapter opens. Players read this before voting.
- **Outcome** (`{universe}/{chapter}/outcome.md`) — what happened as a result of the vote. Published after the choice point closes, while the next chapter is being written. Players see this in place of the voting UI during the 2-day author window.

The vote prompt and choice button labels come from DynamoDB, not S3, so they can be seeded independently and don't require a file upload.

### Beat Cadence

7 days per story beat:
- **Days 0–5**: Voting open. Players read the story and cast their vote.
- **Day 5**: Voting closes. Tally computed, quantum yield calculated, artifacts distributed.
- **Days 5–7**: Author window. Outcome story published; next chapter written.
- **Day 7**: New chapter opens.

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

**GitHub:** https://github.com/sjmorris-dlore/eigenthrope

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

## Open Questions

1. Minimum participation weight for a vote to count?
2. How to handle simultaneous votes during tallying (race conditions)
3. Whether to expose a public API for community-built tools (wikis, trackers)
4. What fields should an author dashboard expose for managing immutable facts vs. community knowledge state?
5. How much of the public archive should be generated automatically from DB state vs. authored manually?

---

*Last updated: June 24, 2026*
