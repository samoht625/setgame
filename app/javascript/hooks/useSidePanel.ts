import { useCallback, useEffect, useState } from 'react'

// Matches Tailwind's `lg` breakpoint: the side panel is an in-flow column at
// and above this width, and a bottom sheet below it.
export const DESKTOP_QUERY = '(min-width: 1024px)'
const PANEL_OPEN_KEY = 'setgame_panel_open'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  ))

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(query)
    const onChange = () => setMatches(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [query])

  return matches
}

function readPersistedOpen(): boolean {
  try {
    return localStorage.getItem(PANEL_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Open/closed state for the info panel beside the board.
 *
 * The panel is closed by default so the board has the screen to itself. On
 * desktop the choice is remembered between visits; on phones the panel is a
 * sheet that covers the board, so it always starts closed.
 */
export function useSidePanel() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [open, setOpenState] = useState(() => isDesktop && readPersistedOpen())

  /**
   * Open or close the panel. Pass `{ persist: false }` for app-driven changes
   * (such as showing the leaderboard when a game ends) so they do not overwrite
   * the preference the player expressed by opening or closing it themselves.
   */
  const setOpen = useCallback((next: boolean, { persist = true }: { persist?: boolean } = {}) => {
    setOpenState(next)
    if (!persist) return
    try {
      localStorage.setItem(PANEL_OPEN_KEY, next ? '1' : '0')
    } catch {
      // Ignore storage failures
    }
  }, [])

  const toggle = useCallback(() => setOpenState(prev => {
    try {
      localStorage.setItem(PANEL_OPEN_KEY, prev ? '0' : '1')
    } catch {
      // Ignore storage failures
    }
    return !prev
  }), [])

  return { open, setOpen, toggle, isDesktop }
}
