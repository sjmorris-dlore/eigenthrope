import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Eigenthrope',
}

export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 sm:px-8 dark:bg-black">
      <main className="w-full max-w-2xl space-y-10 text-zinc-700 dark:text-zinc-300">

        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-400">Eigenthrope</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Privacy Policy</h1>
          <p className="mt-2 text-sm text-zinc-400">Last updated: June 2026</p>
        </div>

        <section className="space-y-4">
          <p>
            Eigenthrope is a community storytelling game played on the XRP Ledger. This policy explains
            what information the game sees, how it is used, and what it never touches.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">What we collect</h2>
          <ul className="space-y-2 text-sm leading-7">
            <li><span className="font-semibold text-zinc-900 dark:text-zinc-100">XRPL wallet address.</span> When you connect your Xaman wallet, your public XRP Ledger address is stored so the game can look up your votes, resonance score, and artifact eligibility. This address is public by design on the XRP Ledger.</li>
            <li><span className="font-semibold text-zinc-900 dark:text-zinc-100">On-chain vote data.</span> Each vote you cast is a transaction recorded on the XRP Ledger. That transaction — including your wallet address and your choice — is permanently and publicly visible on the ledger. We read this data to compute tallies and resonance scores.</li>
            <li><span className="font-semibold text-zinc-900 dark:text-zinc-100">NFT artifact records.</span> When an artifact is minted for you or claimed by you, we store the NFT token ID, offer ID, and your wallet address in our database to manage the claim flow.</li>
            <li><span className="font-semibold text-zinc-900 dark:text-zinc-100">Display name (optional).</span> You may set a public display name for the leaderboard from the Artifacts page. It is shown alongside your wallet address, is entirely optional, and can be removed by you at any time. Without one, you appear by wallet address only.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">What we never collect</h2>
          <ul className="space-y-2 text-sm leading-7">
            <li>We never see, request, or store your private key, secret seed, or secret numbers.</li>
            <li>We never collect your name, email address, phone number, or any personally identifying information.</li>
            <li>We do not use advertising trackers or analytics cookies.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">How we use your data</h2>
          <p className="text-sm leading-7">
            Your wallet address and on-chain vote data are used solely to run the game: computing
            resonance scores, determining NFT eligibility, displaying tallies, and managing artifact
            claims. We do not sell, share, or use this data for any advertising or marketing purpose.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Third-party services</h2>
          <ul className="space-y-2 text-sm leading-7">
            <li><span className="font-semibold text-zinc-900 dark:text-zinc-100">Xaman (XUMM).</span> Transaction signing is handled entirely by the Xaman wallet app. Eigenthrope never receives your private key. Xaman's own privacy policy governs their handling of your data.</li>
            <li><span className="font-semibold text-zinc-900 dark:text-zinc-100">XRP Ledger.</span> The XRPL is a public, decentralized blockchain. All vote transactions are permanently visible to anyone.</li>
            <li><span className="font-semibold text-zinc-900 dark:text-zinc-100">AWS.</span> Game state (chapters, tallies, artifact records) is stored in AWS infrastructure in the US East region.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Data retention and deletion</h2>
          <p className="text-sm leading-7">
            On-chain data cannot be deleted — it is part of the permanent XRP Ledger record. Off-chain
            records (artifact claim status, resonance cache) can be removed on request. To request
            deletion of your off-chain data, contact us at the address below.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Contact</h2>
          <p className="text-sm leading-7">
            Questions about this policy: <a href="mailto:info@sjmorriswrites.com" className="underline hover:text-zinc-900 dark:hover:text-zinc-50">info@sjmorriswrites.com</a>
          </p>
        </section>

      </main>
    </div>
  )
}
