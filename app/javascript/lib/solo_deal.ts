import { isSet, setExists } from './rules'
import { SeededRng, fullDeck } from './seeded_shuffle'

export type SoloDealState = {
  board: number[]
  deck: number[]
  rng: SeededRng
}

function dealN(count: number, state: SoloDealState): void {
  const n = Math.min(count, state.deck.length)
  for (let i = 0; i < n; i++) {
    state.board.push(state.deck.shift()!)
  }
}

function ensureSetsExist(state: SoloDealState): void {
  while (state.board.length < 18 && !setExists(state.board) && state.deck.length > 0) {
    dealN(3, state)
  }

  if (state.board.length >= 18 && !setExists(state.board)) {
    // Canonical order: board first, then deck
    const pool = [...state.board, ...state.deck]
    state.rng.shuffleInPlace(pool)
    state.deck = pool
    state.board = []
    dealN(12, state)

    while (state.board.length < 18 && !setExists(state.board) && state.deck.length > 0) {
      dealN(3, state)
    }
  }
}

export function startSoloDeal(seed: number): SoloDealState {
  const rng = new SeededRng(seed)
  const state: SoloDealState = {
    board: [],
    deck: rng.shuffle(fullDeck()),
    rng
  }
  dealN(12, state)
  ensureSetsExist(state)
  return state
}

export function applySoloClaim(state: SoloDealState, cardIds: number[]): { ok: true } | { ok: false; error: string } {
  if (cardIds.length !== 3) return { ok: false, error: 'Must select exactly 3 cards' }
  if (!isSet(cardIds[0], cardIds[1], cardIds[2])) {
    return { ok: false, error: 'Not a valid set' }
  }
  if (!cardIds.every(id => state.board.includes(id))) {
    return { ok: false, error: 'One or more cards are no longer on the board' }
  }

  const preLength = state.board.length
  if (preLength >= 15) {
    for (const id of cardIds) {
      const idx = state.board.indexOf(id)
      if (idx !== -1) state.board.splice(idx, 1)
    }
  } else {
    for (const id of cardIds) {
      const idx = state.board.indexOf(id)
      if (idx === -1) continue
      if (state.deck.length > 0) {
        state.board[idx] = state.deck.shift()!
      } else {
        state.board.splice(idx, 1)
      }
    }
  }

  ensureSetsExist(state)
  return { ok: true }
}

export function isRoundOver(state: SoloDealState): boolean {
  return state.deck.length === 0 && !setExists(state.board)
}

export function restoreSoloDeal(
  board: number[],
  deck: number[],
  rngState: number
): SoloDealState {
  return {
    board: [...board],
    deck: [...deck],
    rng: SeededRng.fromState(rngState)
  }
}
