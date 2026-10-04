import { formatTime } from '../solitaire/time'

export const DAILY_URL = 'https://set.tido.site/daily'
// Must match DailyPuzzle::TIME_ZONE.
export const DAILY_TIME_ZONE = 'America/Los_Angeles'

/** The Daily's calendar day (YYYY-MM-DD) at `now`. Days roll over at midnight Pacific. */
export function dailyDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DAILY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

const SETS_PER_SQUARE = 3
// Upper bound on the average time per set within a square.
const PACE_SQUARES: Array<[number, string]> = [
  [6_000, '🟩'],
  [10_000, '🟨'],
  [16_000, '🟧'],
  [Infinity, '🟥']
]

/**
 * One square per three sets, colored by how quickly they were found, so a
 * whole game fits on one line: 🟩 under 6s a set, 🟨 under 10s, 🟧 under 16s, 🟥 slower.
 */
export function paceRow(claimMs: number[]): string {
  let row = ''
  for (let start = 0; start < claimMs.length; start += SETS_PER_SQUARE) {
    const chunk = claimMs.slice(start, start + SETS_PER_SQUARE)
    const from = start === 0 ? 0 : claimMs[start - 1]!
    const perSet = (chunk[chunk.length - 1]! - from) / chunk.length
    row += PACE_SQUARES.find(([max]) => perSet < max)![1]
  }
  return row
}

export type DailyShare = {
  number: number
  elapsedMs: number
  claimMs: number[]
  // Signed by the server; lets link previews show this result.
  token?: string
}

export function dailyShareText({ number, elapsedMs, claimMs, token }: DailyShare): string {
  return [
    `Set Daily #${number} · ${formatTime(elapsedMs)}`,
    paceRow(claimMs),
    token ? `${DAILY_URL}?r=${encodeURIComponent(token)}` : DAILY_URL
  ].filter(Boolean).join('\n')
}

const ORDINAL_SUFFIXES: Partial<Record<Intl.LDMLPluralRule, string>> = { one: 'st', two: 'nd', few: 'rd' }
const ordinalRules = new Intl.PluralRules('en-US', { type: 'ordinal' })

export function ordinal(n: number): string {
  return `${n}${ORDINAL_SUFFIXES[ordinalRules.select(n)] ?? 'th'}`
}

/** "7h 5m" / "42m", rounded up so it never reads 0m before the rollover. */
export function formatCountdown(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000))
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

/** The native share sheet on touch devices, the clipboard everywhere else. */
export async function shareText(text: string): Promise<ShareOutcome> {
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  if (touch && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed'
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // No async clipboard (older browsers, insecure origins): copy a selection instead.
  }
  try {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    const copied = document.execCommand('copy')
    field.remove()
    return copied
  } catch {
    return false
  }
}
