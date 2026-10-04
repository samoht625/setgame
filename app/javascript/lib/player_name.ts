import { getPlayerId } from './player_id'

/** Same rule as the server's PlayerName: 1–20 letters, digits, spaces, _ or -. */
export const NAME_MAX_LENGTH = 20
const NAME_PATTERN = /^[\p{L}\p{Nd} _-]+$/u
const CHANGE_EVENT = 'setgame:name'

/** The trimmed name, '' when blank, or null when it has characters the leaderboard won't take. */
export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/ {2,}/g, ' ')
  if (name === '') return ''
  return name.length <= NAME_MAX_LENGTH && NAME_PATTERN.test(name) ? name : null
}

export const NAME_HINT = 'Letters, numbers, spaces, _ and - only'

/** The name this browser plays under in every mode (solo, daily and multiplayer share it). */
export function getSavedName(): string | null {
  try {
    return localStorage.getItem(`setgame_player_name:${getPlayerId()}`) || localStorage.getItem('setgame_name') || null
  } catch {
    return null
  }
}

/** Saves the name for future scores and tells any open game (multiplayer, today's daily) about it. */
export function saveName(name: string): void {
  try {
    localStorage.setItem(`setgame_player_name:${getPlayerId()}`, name)
  } catch {
    // The name still applies for this visit through the event below.
  }
  window.dispatchEvent(new CustomEvent<string>(CHANGE_EVENT, { detail: name }))
}

export function onNameChange(listener: (name: string) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<string>).detail)
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}
