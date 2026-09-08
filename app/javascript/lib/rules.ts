// Port of the Ruby Rules module to TypeScript
// Card attributes: number, color, shape, shading
// Each attribute has values 0, 1, or 2
// Mapping: card id (1-81) maps to base-3 digits of (id - 1), least significant first.
// This matches the artwork in public/cards:
//   digit 0 -> number  (0 = one, 1 = two, 2 = three)
//   digit 1 -> color   (0 = red, 1 = purple, 2 = green)
//   digit 2 -> shape   (0 = squiggle, 1 = diamond, 2 = oval)
//   digit 3 -> shading (0 = solid, 1 = striped, 2 = open)

export interface CardAttributes {
  number: number
  color: number
  shape: number
  shading: number
}

export function cardAttributes(cardId: number): CardAttributes {
  const x = cardId - 1
  const number = x % 3
  const color = Math.floor(x / 3) % 3
  const shape = Math.floor(x / 9) % 3
  const shading = Math.floor(x / 27) % 3

  return { number, color, shape, shading }
}

// Each attribute's three values must sum to zero modulo 3.
const THIRD_CARDS = Array.from({ length: 81 }, (_, first) => {
  const row = new Uint8Array(81)
  for (let second = 0; second < 81; second++) {
    let a = first
    let b = second
    let third = 1
    for (let place = 1; place <= 27; place *= 3) {
      third += ((6 - a % 3 - b % 3) % 3) * place
      a = Math.floor(a / 3)
      b = Math.floor(b / 3)
    }
    row[second] = third
  }
  return row
})

function thirdCard(card1: number, card2: number): number | undefined {
  return THIRD_CARDS[card1 - 1]?.[card2 - 1]
}

export function isSet(card1: number, card2: number, card3: number): boolean {
  const third = thirdCard(card1, card2)
  return third !== undefined && third === card3
}

export function setExists(board: number[]): boolean {
  if (board.length < 3) return false

  const lastPositions = new Map<number, number>()
  for (let i = 0; i < board.length; i++) lastPositions.set(board[i], i)

  for (let i = 0; i < board.length - 2; i++) {
    for (let j = i + 1; j < board.length - 1; j++) {
      const third = thirdCard(board[i], board[j])
      // The completing card must occupy a third position, even for repeated IDs.
      if (third !== undefined && (lastPositions.get(third) ?? -1) > j) return true
    }
  }

  return false
}
