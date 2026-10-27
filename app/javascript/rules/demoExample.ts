import { cardAttributes, isSet } from '../lib/rules'

export const FEATURE_KEYS = ['number', 'color', 'shape', 'shading'] as const
export type FeatureKey = (typeof FEATURE_KEYS)[number]
export type Verdict = 'same' | 'different'

export interface DemoExample {
  /** Six card ids, in board order. */
  board: number[]
  /** The three ids of the board's one set. */
  set: number[]
}

type Random = () => number

const pick = (random: Random, n: number) => Math.floor(random() * n)

function shuffle<T>(items: T[], random: Random): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = pick(random, i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

const cardId = (digits: number[]) => 1 + digits.reduce((sum, digit, place) => sum + digit * 3 ** place, 0)

/** Whether each feature is the same on all three cards or different on all three. */
export function verdicts(set: number[]): Record<FeatureKey, Verdict> {
  const out = {} as Record<FeatureKey, Verdict>
  for (const key of FEATURE_KEYS) out[key] = new Set(set.map(id => cardAttributes(id)[key])).size === 1 ? 'same' : 'different'
  return out
}

export function findSets(board: number[]): number[][] {
  const sets: number[][] = []
  for (let i = 0; i < board.length; i++)
    for (let j = i + 1; j < board.length; j++)
      for (let k = j + 1; k < board.length; k++) if (isSet(board[i]!, board[j]!, board[k]!)) sets.push([board[i]!, board[j]!, board[k]!])
  return sets
}

/**
 * Six random cards holding exactly one set, in which `sameCount` (0 to 3) of
 * the four features are the same across the set and the rest are different.
 */
export function makeExample(sameCount: number, random: Random = Math.random): DemoExample {
  const same = new Set(shuffle([0, 1, 2, 3], random).slice(0, Math.max(0, Math.min(3, sameCount))))
  const first = [0, 1, 2, 3].map(() => pick(random, 3))
  const offset = 1 + pick(random, 2)
  const second = first.map((digit, place) => (same.has(place) ? digit : (digit + offset) % 3))
  const third = first.map((digit, place) => (same.has(place) ? digit : (digit + 2 * offset) % 3))
  const set = [first, second, third].map(cardId)
  for (;;) {
    const board = set.slice()
    while (board.length < 6) {
      const id = 1 + pick(random, 81)
      if (!board.includes(id)) board.push(id)
    }
    if (findSets(board).length === 1) return { board: shuffle(board, random), set }
  }
}

/** A number of same features different from the last one, so each new example shows a new pattern. */
export function nextSameCount(previous: number | null, random: Random = Math.random): number {
  const choices = [0, 1, 2, 3].filter(count => count !== previous)
  return choices[pick(random, choices.length)]!
}
