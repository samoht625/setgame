import { useCallback, useEffect, useRef, useState } from 'react'

/** How long a two-card player's completed set stays highlighted before the game moves on. */
export const AUTO_COMPLETE_REVEAL_MS = 400

/**
 * The two-card experiment's "here's your set" moment: the three cards (and
 * which one the game filled in) stay highlighted briefly, then `then` runs.
 */
export function useAutoCompleteReveal() {
  const [cards, setCards] = useState<number[]>([])
  const [filled, setFilled] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }

  const cancel = useCallback(() => {
    clearTimer()
    setCards([])
    setFilled(null)
  }, [])

  const reveal = useCallback((set: number[], filledCard: number, then?: () => void) => {
    clearTimer()
    setCards(set)
    setFilled(filledCard)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setCards([])
      setFilled(null)
      then?.()
    }, AUTO_COMPLETE_REVEAL_MS)
  }, [])

  useEffect(() => clearTimer, [])

  return { cards, filled, revealing: cards.length > 0, reveal, cancel }
}
