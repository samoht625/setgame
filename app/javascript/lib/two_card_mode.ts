import { thirdCard } from './rules'
import { getPlayerId, knownPlayer } from './player_id'
import { apiFetch, headers } from './solo_api'

/** Same message the server sends (TwoCardMode::THIRD_CARD_MISSING). */
export const THIRD_CARD_MISSING = "The third card isn't on the board"

/** Players with these names start with two-card mode on. Must match TwoCardMode::DEFAULT_ON_NAMES. */
export const DEFAULT_ON_NAMES = ['Tido', 'Rose', 'Yaniv']

const CHANGE_EVENT = 'setgame:two-card'

function normalize(name: string): string {
  return name.trim().replace(/ {2,}/g, ' ').toLowerCase()
}

function defaultOn(name: string | null | undefined): boolean {
  const key = normalize(name ?? '')
  return key !== '' && DEFAULT_ON_NAMES.some(defaultName => normalize(defaultName) === key)
}

// undefined until the page's value has been read.
let choice: boolean | null | undefined

/** The player's own setting, from the page (see KnownPlayer) or changed since; null until they've switched it. */
export function twoCardChoice(): boolean | null {
  if (choice !== undefined) return choice
  if (typeof document === 'undefined') return null
  // The page's value is for the player the server's cookie names.
  const known = knownPlayer()
  const content = known && known.id === getPlayerId() ? document.querySelector<HTMLMetaElement>('meta[name="setgame-two-card"]')?.content : undefined
  choice = content === 'on' ? true : content === 'off' ? false : null
  return choice
}

/** Whether two-card mode is on for the player with this display name: their own setting, else the default for the name. */
export function twoCardModeOn(name: string | null | undefined, chosen: boolean | null = twoCardChoice()): boolean {
  return chosen ?? defaultOn(name)
}

export function onTwoCardChange(listener: (chosen: boolean) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<boolean>).detail)
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}

/** Saves the player's setting on the server, where multiplayer reads it; it applies here once saved. */
export async function saveTwoCardMode(enabled: boolean): Promise<boolean> {
  try {
    const res = await apiFetch('/api/settings', {
      method: 'PATCH',
      headers: headers(),
      credentials: 'same-origin',
      body: JSON.stringify({ two_card_mode: enabled }),
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) return false
    choice = enabled
    window.dispatchEvent(new CustomEvent<boolean>(CHANGE_EVENT, { detail: enabled }))
    return true
  } catch {
    return false
  }
}

/**
 * The cards a click leaves picked. In two-card mode, a second card brings
 * its set's third card along (`filled`); `missing` means that card isn't on
 * the board, which counts as a miss.
 */
export function autoCompletePick(picked: number[], board: number[], enabled: boolean): { cards: number[]; filled: number | null; missing: boolean } {
  if (!enabled || picked.length !== 2) return { cards: picked, filled: null, missing: false }
  const third = thirdCard(picked[0]!, picked[1]!)
  return third !== undefined && board.includes(third)
    ? { cards: [...picked, third], filled: third, missing: false }
    : { cards: picked, filled: null, missing: true }
}
