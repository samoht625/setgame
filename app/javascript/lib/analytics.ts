export type GameModeEvent = 'solo' | 'daily' | 'puzzle' | 'multi'

type EventData = Record<string, string | number | boolean>

declare global {
  interface Window {
    umami?: { track: (event: string, data?: EventData) => unknown }
  }
}

/** Sends an Umami custom event. The tracker is injected by the host and may be blocked or missing. */
export function track(event: string, data?: EventData): void {
  try {
    window.umami?.track(event, data)
  } catch {
    // Analytics must never interrupt a game.
  }
}

/** For events at page load, before the async tracker has arrived: waits up to ~10s for it. */
export function trackWhenReady(event: string, data?: EventData, tries = 20): void {
  if (window.umami || tries <= 0) return track(event, data)
  setTimeout(() => trackWhenReady(event, data, tries - 1), 500)
}

export function seconds(ms: number): number {
  return Math.max(0, Math.round(ms / 1000))
}
