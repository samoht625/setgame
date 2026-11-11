import { thirdCard } from './rules'

/** Same message the server sends (TwoCardMode::THIRD_CARD_MISSING). */
export const THIRD_CARD_MISSING = "The third card isn't on the board"

function normalize(name: string): string {
  return name.trim().replace(/ {2,}/g, ' ').toLowerCase()
}

function allowedNames(): string[] {
  if (typeof document === 'undefined') return []
  const content = document.querySelector<HTMLMetaElement>('meta[name="setgame-two-card-names"]')?.content ?? ''
  return content.split(',').map(normalize).filter(Boolean)
}

/** Whether this display name is in the two-card experiment (the list lives in TwoCardMode on the server). */
export function inTwoCardMode(name: string | null | undefined, names: string[] = allowedNames()): boolean {
  const key = normalize(name ?? '')
  return key !== '' && names.some(allowed => normalize(allowed) === key)
}

/**
 * The cards a click leaves picked. For a player in the experiment, a second
 * card brings its set's third card along; `missing` means that card isn't on
 * the board, which counts as a miss.
 */
export function autoCompletePick(picked: number[], board: number[], enabled: boolean): { cards: number[]; missing: boolean } {
  if (!enabled || picked.length !== 2) return { cards: picked, missing: false }
  const third = thirdCard(picked[0]!, picked[1]!)
  return third !== undefined && board.includes(third)
    ? { cards: [...picked, third], missing: false }
    : { cards: picked, missing: true }
}
