// Mulberry32 PRNG with integer-only Fisher–Yates.
// Must stay bit-identical to app/services/solo_rng.rb

const MASK = 0xffffffff

export class SeededRng {
  private state: number

  constructor(seed: number | string) {
    this.state = seedToU32(seed)
  }

  static fromState(state: number): SeededRng {
    const rng = new SeededRng(0)
    rng.state = state >>> 0
    return rng
  }

  getState(): number {
    return this.state >>> 0
  }

  /** Next uint32 in [0, 2^32) */
  nextU32(): number {
    // Classic mulberry32 (uint32 output, no float division)
    let t = (this.state = (this.state + 0x6d2b79f5) | 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }

  /** Integer index in [0, n) */
  nextIndex(n: number): number {
    if (n <= 0) throw new Error('n must be positive')
    return this.nextU32() % n
  }

  /** Fisher–Yates; mutates and returns array */
  shuffleInPlace<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.nextIndex(i + 1)
      ;[array[i], array[j]] = [array[j], array[i]]
    }
    return array
  }

  shuffle<T>(array: T[]): T[] {
    return this.shuffleInPlace(array.slice())
  }
}

function seedToU32(seed: number | string): number {
  if (typeof seed === 'number') {
    return seed >>> 0
  }
  // FNV-1a 32-bit over UTF-8 bytes
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193)
  }
  return h >>> 0
}

export function seededShuffle(array: number[], seed: number | string): number[] {
  return new SeededRng(seed).shuffle(array)
}

export function fullDeck(): number[] {
  return Array.from({ length: 81 }, (_, i) => i + 1)
}
