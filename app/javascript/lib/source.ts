import { isNewPlayer } from './player_id'

const STORAGE_KEY = 'setgame_source_v1'
const TAG = /^[a-z0-9][a-z0-9._-]{0,39}$/

export type FirstTouch = { source: string; landing: string }

let cached: FirstTouch | null | undefined

function tag(value: string | null): string | null {
  const cleaned = value?.trim().toLowerCase() ?? ''
  return TAG.test(cleaned) ? cleaned : null
}

/** Groups a referrer's host: every Reddit app and domain is "reddit", any Wikipedia is "wikipedia", Google search is "google". */
export function referrerSource(referrer: string, ownHost: string): string | null {
  let host: string
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  if (!host || host === ownHost.replace(/^www\./, '')) return null
  if (host.includes('reddit')) return 'reddit'
  if (host.endsWith('wikipedia.org')) return 'wikipedia'
  if (host === 'mail.google.com' || host === 'com.google.android.gm') return 'gmail'
  if (/(^|\.)google\.[a-z.]+$/.test(host) || host === 'com.google.android.googlequicksearchbox') return 'google'
  return tag(host)
}

/**
 * Where a first visit came from, most specific first: a ?ref= tag on a posted
 * link (ref:dib2), a utm_source, a friend's shared result (?r=), the referring
 * site, or direct.
 */
export function sourceOf(url: URL, referrer: string): string {
  const ref = tag(url.searchParams.get('ref'))
  if (ref) return `ref:${ref}`
  const utm = tag(url.searchParams.get('utm_source'))
  if (utm) return `utm:${utm}`
  if (url.searchParams.has('r')) return 'share'
  return referrerSource(referrer, url.hostname) ?? 'direct'
}

/** Notes the source of this browser's first visit. Players from before this existed have none. */
export function captureFirstTouch(): void {
  if (!isNewPlayer() || firstTouch()) return
  const url = new URL(window.location.href)
  const touch = { source: sourceOf(url, document.referrer), landing: url.pathname.toLowerCase() }
  cached = touch
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(touch))
  } catch {
    // Kept for this page load only.
  }
}

export function firstTouch(): FirstTouch | null {
  if (cached !== undefined) return cached
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as FirstTouch | null
    cached = parsed && typeof parsed.source === 'string' ? parsed : null
  } catch {
    cached = null
  }
  return cached
}
