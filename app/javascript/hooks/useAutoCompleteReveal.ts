import { useCallback, useEffect, useRef, useState } from 'react'

/** How long a two-card player's completed set stays highlighted before the game moves on. */
export const AUTO_COMPLETE_REVEAL_MS = 400
/** The end of that hold, when cards about to be replaced fade out (see .animate-set-leave). */
const LEAVE_MS = 120

/** `found` is a new set (amber); `repeat` is a set already found (red). */
export type RevealTone = 'found' | 'repeat'

/**
 * The two-card experiment's "here's your set" moment: the three cards (and
 * which one the game filled in) stay highlighted briefly, then `then` runs.
 * With `leave`, the cards fade out at the end, for boards that replace them.
 */
export function useAutoCompleteReveal() {
  const [cards, setCards] = useState<number[]>([])
  const [filled, setFilled] = useState<number | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [tone, setTone] = useState<RevealTone>('found')
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  const cancel = useCallback(() => {
    clearTimers()
    setCards([])
    setFilled(null)
    setLeaving(false)
  }, [])

  const reveal = useCallback((set: number[], filledCard: number, then?: () => void, leave = false, revealTone: RevealTone = 'found') => {
    clearTimers()
    setCards(set)
    setFilled(filledCard)
    setLeaving(false)
    setTone(revealTone)
    if (leave) timersRef.current.push(setTimeout(() => setLeaving(true), AUTO_COMPLETE_REVEAL_MS - LEAVE_MS))
    timersRef.current.push(setTimeout(() => {
      timersRef.current = []
      setCards([])
      setFilled(null)
      setLeaving(false)
      then?.()
    }, AUTO_COMPLETE_REVEAL_MS))
  }, [])

  useEffect(() => clearTimers, [])

  return { cards, filled, leaving, tone, revealing: cards.length > 0, reveal, cancel }
}
