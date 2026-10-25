import React from 'react'

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

/** Squares to a row, so rows line up; a short last row fills from the left. */
const COLUMNS = 12

/** g/y/r per set found (Daily Deal) or h/m per attempt (Puzzle), as a quiet grid of squares. */
const MarkGrid: React.FC<{ marks: string; label: string }> = ({ marks, label }) => {
  const list = Array.from(marks).filter(mark => MARKS[mark])
  if (list.length === 0) return null
  const counts: Record<string, number> = {}
  for (const mark of list) counts[mark] = (counts[mark] ?? 0) + 1
  const summary = Object.keys(MARKS).filter(mark => counts[mark]).map(mark => `${counts[mark]} ${MARKS[mark]!.label}`).join(', ')
  return (
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
}

export default MarkGrid
