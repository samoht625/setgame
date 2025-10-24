// Port of Ruby Rules module to TypeScript
// Card attributes: number, shape, shading, color
// Each attribute has values 0, 1, or 2
// Mapping: card id (1-81) maps to base-3 representation

export interface CardAttributes {
  number: number
  shape: number
  shading: number
  color: number
}

export function cardAttributes(cardId: number): CardAttributes {
  // Convert card_id (1-81) to base-3 representation
  const x = cardId - 1
  const number = x % 3
  const shape = Math.floor(x / 3) % 3
  const shading = Math.floor(x / 9) % 3
  const color = Math.floor(x / 27) % 3
  
  return { number, shape, shading, color }
}

export function isSet(card1: number, card2: number, card3: number): boolean {
  const attrs1 = cardAttributes(card1)
  const attrs2 = cardAttributes(card2)
  const attrs3 = cardAttributes(card3)
  
  // For each attribute, all three cards must be either:
  // - all the same value, OR
  // - all different values
  const attributes: (keyof CardAttributes)[] = ['number', 'shape', 'shading', 'color']
  
  return attributes.every(attr => {
    const vals = [attrs1[attr], attrs2[attr], attrs3[attr]]
    const uniqueCount = new Set(vals).size
    return uniqueCount === 1 || uniqueCount === 3
  })
}

export function setExists(board: number[]): boolean {
  if (board.length < 3) return false
  
  // Try all combinations of 3 cards
  for (let i = 0; i < board.length - 2; i++) {
    for (let j = i + 1; j < board.length - 1; j++) {
      for (let k = j + 1; k < board.length; k++) {
        if (isSet(board[i], board[j], board[k])) {
          return true
        }
      }
    }
  }
  
  return false
}

