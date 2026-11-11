import React, { useId, useState } from 'react'

// The share grid as it shows on the page: flat squares in the site palette
// instead of emoji, which render glossy and uneven from one platform to the
// next. The share text keeps its emoji (shareGrid in lib/daily.ts).
const MARKS: Record<string, { label: string; className: string }> = {
  g: { label: 'quick', className: 'bg-emerald-500 dark:bg-emerald-400' },
  y: { label: 'typical', className: 'bg-amber-400 dark:bg-amber-300' },
  r: { label: 'slow', className: 'bg-rose-400' },
  h: { label: 'found', className: 'bg-emerald-500 dark:bg-emerald-400' },
  m: { label: 'missed', className: 'bg-rose-400' }
}

// What each square means, in the legend. The pace cutoffs mirror ShareGrid::FAST and ::SLOW.
const LEGENDS: { marks: string; intro: string; rows: Record<string, string> }[] = [
  {
    marks: 'gyr',
    intro: 'One square per set, in order, timed against every player’s median for that set.',
    rows: { g: '20%+ faster than the median', y: 'Close to the median', r: '25%+ slower than the median' }
  },
  {
    marks: 'hm',
    intro: 'One square per guess, in order.',
    rows: { h: 'A set', m: 'Not a set' }
  }
]

/** Squares to a row, as in the shared text (shareGrid in lib/daily.ts); a short last row fills from the left. */
const COLUMNS = 9

/** g/y/r per set found (Daily Deal) or h/m per attempt (Puzzle), as a quiet grid of squares with a legend on hover or tap. */
const MarkGrid: React.FC<{ marks: string; label: string }> = ({ marks, label }) => {
  const legendId = useId()
  const [open, setOpen] = useState(false)
  const list = Array.from(marks).filter(mark => MARKS[mark])
  if (list.length === 0) return null
  const counts: Record<string, number> = {}
  for (const mark of list) counts[mark] = (counts[mark] ?? 0) + 1
  const summary = Object.keys(MARKS).filter(mark => counts[mark]).map(mark => `${counts[mark]} ${MARKS[mark]!.label}`).join(', ')
  const legend = LEGENDS.find(entry => list.some(mark => entry.marks.includes(mark)))
  const grid = (
    <div
      role="img"
      aria-label={`${label}: ${summary}`}
      data-share-grid={list.join('')}
      className="inline-grid gap-1"
      style={{ gridTemplateColumns: `repeat(${Math.min(list.length, COLUMNS)}, 0.75rem)` }}
    >
      {list.map((mark, index) => (
        <span key={index} data-mark={mark} className={`size-3 rounded-[3px] ${MARKS[mark]!.className}`} />
      ))}
    </div>
  )
  if (!legend) return grid

  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        aria-describedby={legendId}
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        onBlur={() => setOpen(false)}
        onKeyDown={event => {
          if (event.key === 'Escape') setOpen(false)
        }}
        className="flex rounded-md p-1.5 transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:bg-neutral-800"
      >
        {grid}
      </button>
      <div
        id={legendId}
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 top-full z-10 mt-1 w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-neutral-200 bg-white p-3 text-left shadow-lg transition-opacity dark:border-neutral-700 dark:bg-neutral-900 ${
          open ? 'visible opacity-100' : 'invisible opacity-0 group-hover:visible group-hover:opacity-100'
        }`}
      >
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{legend.intro}</p>
        <ul className="mt-2 space-y-1.5">
          {Array.from(legend.marks).map(mark => (
            <li key={mark} className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-200">
              <span aria-hidden="true" className={`size-3 shrink-0 rounded-[3px] ${MARKS[mark]!.className}`} />
              <span>
                <span className="font-medium capitalize">{MARKS[mark]!.label}</span>
                <span className="text-neutral-500 dark:text-neutral-400"> · {legend.rows[mark]}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default MarkGrid
