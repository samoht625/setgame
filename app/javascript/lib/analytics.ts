export type GameModeEvent = 'solo' | 'daily' | 'multi'

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

export function seconds(ms: number): number {
  return Math.max(0, Math.round(ms / 1000))
}
