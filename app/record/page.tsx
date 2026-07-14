import RecordClient from '@/app/components/RecordClient'
import DiscordTicker from '@/app/components/DiscordTicker'

export const metadata = {
  title: 'The Record — Eigenthrope',
}

export default function RecordPage() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 sm:px-8 dark:bg-black">
      <main className="flex w-full max-w-2xl flex-col gap-12">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            The Record
          </h1>
          <p className="mt-3 text-base leading-7 text-zinc-500 dark:text-zinc-400">
            Register your observation. The record will vindicate you.
          </p>
          <p className="mt-4 text-sm leading-6 text-zinc-400 dark:text-zinc-500">
            Seal a theory about the mystery and its fingerprint is written to the
            ledger — timestamped, unreadable, permanent. Nobody sees what you
            observed. Everyone sees that you observed <em>something</em>, and when.
            When the story proves you right, reveal it: the ledger will testify
            you saw it first. The Record survives episodes, universes, and resets.
          </p>
        </div>
        <RecordClient />
      </main>
      <DiscordTicker />
    </div>
  )
}
