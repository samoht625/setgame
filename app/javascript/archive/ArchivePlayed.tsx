import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { withTimeout } from '../lib/abort'
import { dayPlays, fetchRankedTimes, readArchiveTile, rememberedPlays, type ArchiveTile, type DayPlay, type RankedTimes } from '../lib/archive'
import { formatTime } from '../solitaire/time'

type Tile = ArchiveTile & { link: HTMLElement; slot: HTMLElement }

/** The day tiles the page was served with (archive/index.html.erb). */
function pageTiles(): Tile[] {
  const tiles: Tile[] = []
  for (const link of document.querySelectorAll<HTMLElement>('[data-archive-tile]')) {
    const tile = readArchiveTile(link.dataset.archiveTile, link.dataset.archiveDate)
    const slot = link.querySelector<HTMLElement>('[data-archive-status]')
    if (tile && slot) tiles.push({ ...tile, link, slot })
  }
  return tiles
}

const TONES = {
  emerald: 'text-emerald-700 dark:text-emerald-300',
  amber: 'text-amber-800 dark:text-amber-300'
}

const Check: React.FC = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none">
    <circle cx="8" cy="8" r="8" fill="currentColor" />
    <path d="M4.6 8.3l2.2 2.2 4.6-4.9" className="stroke-white dark:stroke-neutral-900" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const Arrow: React.FC = () => <span aria-hidden="true" className="ml-1">→</span>

/** The player's own time on a day, and whether it was the ranked run or practice. */
const Time: React.FC<{ tone: keyof typeof TONES; elapsedMs: number; label: string }> = ({ tone, elapsedMs, label }) => (
  <>
    <span className={`flex items-center gap-1 font-semibold tabular-nums md:text-sm ${TONES[tone]}`}>
      <Check />
      <span className="sr-only">Your time </span>
      {formatTime(elapsedMs)}
    </span>{' '}
    <span className={`font-medium ${TONES[tone]}`}>{label}</span>
  </>
)

const Status: React.FC<{ play: DayPlay }> = ({ play }) => {
  switch (play.state) {
    case 'ranked':
      return <Time tone="emerald" elapsedMs={play.elapsedMs} label="On the day" />
    case 'practice':
      return <Time tone="amber" elapsedMs={play.elapsedMs} label="Practice" />
    case 'running':
      return <span className={`font-semibold md:text-sm ${TONES.amber}`}>Resume<span className="sr-only"> practice</span><Arrow /></span>
    case 'unplayed':
      return <span className="font-semibold text-neutral-900 md:text-sm dark:text-neutral-100"><span className="sr-only">Not played. </span>Play<Arrow /></span>
    default: {
      const unknown: never = play
      throw new Error(`Unknown play: ${JSON.stringify(unknown)}`)
    }
  }
}

/**
 * Marks the days on /archive that this player has played. The page is served
 * the same to everyone; this adds, per tile, their own time (from the day
 * itself, or from practice in this browser) or an invitation to play.
 */
const ArchivePlayed: React.FC<{ page: number }> = ({ page }) => {
  const tiles = useMemo(pageTiles, [])
  const [remembered, setRemembered] = useState(() => rememberedPlays(tiles))
  // undefined until the server has answered; null when it couldn't be reached.
  const [server, setServer] = useState<RankedTimes | null | undefined>(undefined)

  useEffect(() => {
    const request = new AbortController()
    const { signal, cleanup } = withTimeout(8000, request.signal)
    fetchRankedTimes(page, signal)
      .then(times => {
        if (!request.signal.aborted) setServer(times)
      })
      .catch(() => {
        if (!request.signal.aborted) setServer(null)
      })
      .finally(cleanup)
    return () => {
      request.abort()
      cleanup()
    }
  }, [page])

  // A day practised in another tab, or before coming back to this page, shows without a reload.
  useEffect(() => {
    const refresh = () => setRemembered(rememberedPlays(tiles))
    window.addEventListener('pageshow', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('pageshow', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [tiles])

  const plays = dayPlays(tiles, remembered, server)

  useLayoutEffect(() => {
    for (const tile of tiles) {
      const play = plays[tile.key]
      if (play) tile.link.dataset.played = play.state
      else delete tile.link.dataset.played
    }
  })

  return <>{tiles.map(tile => {
    const play = plays[tile.key]
    return play ? createPortal(<Status play={play} />, tile.slot, tile.key) : null
  })}</>
}

export default ArchivePlayed
