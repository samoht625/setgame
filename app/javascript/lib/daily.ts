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

export type DailyShare = {
  number: number
  elapsedMs: number
  // Signed by the server; lets link previews show this result.
  token?: string
}

export type ShareLink = { title: string; text: string; url: string }

/** What the share sheet gets. The link is its own field so Messages can unfurl it into a preview. */
export function dailyShareLink({ number, elapsedMs, token }: DailyShare): ShareLink {
  return {
    title: `Set Daily #${number}`,
    text: `Set Daily Puzzle #${number} · ${formatTime(elapsedMs)}`,
    url: token ? `${DAILY_URL}?r=${encodeURIComponent(token)}` : DAILY_URL
  }
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

/** The native share sheet on touch devices; elsewhere the text and link go to the clipboard together. */
export async function shareLink(link: ShareLink): Promise<ShareOutcome> {
  const touch = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  if (touch && typeof navigator.share === 'function') {
    try {
      await navigator.share(link)
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    }
  }
  return (await copyText(`${link.text}\n${link.url}`)) ? 'copied' : 'failed'
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
