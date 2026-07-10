'use client'

interface TallyData {
  counts: Record<string, number>
  choices: Record<string, { label: string; description: string }>
}

export default function Tally({ tally }: { tally: TallyData | null }) {
  if (!tally) return null

  const total = Object.values(tally.counts).reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const choiceIds = Object.keys(tally.choices).length > 0
    ? Object.keys(tally.choices)
    : Object.keys(tally.counts)

  return (
    <div className="mx-auto w-full max-w-sm rounded-xl border border-zinc-200 bg-white px-8 py-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-zinc-400">
          Observer Tally
        </p>
        {choiceIds.map((choice) => {
          const count = tally.counts[choice] ?? 0
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          const label = tally.choices[choice]?.label ?? choice
          return (
            <div key={choice} className="flex items-center gap-3">
              <span className="w-6 text-xs font-semibold text-zinc-400">{choice}</span>
              <div className="h-2 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-2 rounded-full bg-zinc-900 transition-all duration-500 dark:bg-zinc-100"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-10 text-right text-xs text-zinc-500">{pct}%</span>
              <span className="hidden max-w-[120px] truncate text-xs text-zinc-400 sm:inline">{label}</span>
            </div>
          )
        })}
        <p className="text-center text-xs text-zinc-400">
          {total} observation{total !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}
