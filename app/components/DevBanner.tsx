const MSG = 'Under development · Please join in and send feedback, but be aware that the story will reset several times            '

export default function DevBanner() {
  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-8 overflow-hidden bg-amber-400 dark:bg-amber-700">
      <div
        className="flex h-full w-max items-center whitespace-nowrap"
        style={{ animation: 'marquee 25s linear infinite' }}
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-900 dark:text-amber-100 px-12">
          {MSG}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-900 dark:text-amber-100 px-12">
          {MSG}
        </span>
      </div>
    </div>
  )
}
