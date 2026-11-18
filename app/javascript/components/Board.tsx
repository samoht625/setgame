import React, { useEffect, useRef } from 'react'
import CardFace, { describeCard } from './CardFace'
import type { RevealTone } from '../hooks/useAutoCompleteReveal'

// A browser only turns a touch into a click when that finger was the only one
// on the screen from landing to lifting. Two thumbs pressing two cards at
// once, or one landing before the other lifts, get no click at all. So a
// finger picks its card when it lifts (pointerup), each finger on its own,
// and the click the browser may still send for it is dropped. Mouse, pen and
// keyboard still pick on click.
//
// The browser cancels the pointer when it takes the touch for itself, to
// scroll the page, and a cancelled finger picks nothing. A finger that lands
// while the page is still gliding from a flick only stops it, as before: that
// touch is left to the browser, which sends no click for it.
//
// Two thumbs on cards drift apart a little as they press, and a phone reads
// that as a pinch: it zooms the page and cancels both fingers. So a finger on
// a card never pinches, whatever the other finger is on. The cards'
// touch-action says so, by leaving out pinch-zoom, and Chrome and Firefox go
// by that alone. Safari heeds touch-action only in part, and differently from
// version to version, so there the board also cancels the touch events of a
// second finger while a finger is on a card, and Safari's own gesture events
// with them. One finger still scrolls the page from a card.

/** How far (CSS px) a finger may drift between landing and lifting and still be a tap. */
const TAP_SLOP = 16
/** How long after a finger's tap the browser's click for it can still arrive. */
const TOUCH_CLICK_MS = 1000
/** The page counts as still scrolling for this long after it last moved. */
const SCROLL_SETTLE_MS = 100

type Press = { card: HTMLButtonElement; x: number; y: number }

// Dark mode keeps the card faces light, and a card's ring hugs the card there as
// it does in the light theme: the border takes the ring's colour, with nothing
// between the ring and the face.
//
// Keyboard focus in dark mode is one ring as well. On a card with a ring already
// (selected, claimed, a wrong pick) it is that ring made heavier in the same
// colour, so two rings never stack; on any other card it is blue, which reads
// against both the light face and the dark page. These need `!`: the page-wide
// focus outline in application.tailwind.css is unlayered, so it beats utilities.
const DARK_RING = {
  amber: 'dark:border-amber-300 dark:ring-amber-300 dark:focus-visible:outline-[5px]! dark:focus-visible:outline-amber-300!',
  rose: 'dark:border-rose-400 dark:ring-rose-400 dark:focus-visible:outline-[5px]! dark:focus-visible:outline-rose-400!',
  emerald: 'dark:border-emerald-400 dark:ring-emerald-400 dark:focus-visible:outline-[5px]! dark:focus-visible:outline-emerald-400!'
}
const DARK_FOCUS = 'dark:focus-visible:border-blue-500 dark:focus-visible:outline-blue-500!'

interface BoardProps {
  cards: number[]
  selectedCards: number[]
  rejectedCards?: number[]
  foundCards?: number[]
  /** A set the game completed from the player's two picks, shown before it's claimed. */
  completedCards?: number[]
  /** The card the game filled in, within `completedCards`. */
  autoFilledCard?: number | null
  /** The completed set is about to be replaced: fade it out. */
  completedLeaving?: boolean
  /** `repeat`: the completed set was already found, so it shows as a wrong pick. */
  completedTone?: RevealTone
  onCardClick: (cardId: number) => void
  claiming: boolean
  gameOver?: boolean
  /** Shown centered over the dimmed board when the round is over; omit for no card. */
  gameOverContent?: React.ReactNode
  /** Small heading on that card. */
  gameOverLabel?: string
  paused?: boolean
  /** A quiet line under "Paused" on the paused card. */
  pausedNote?: string
  loading?: boolean
  onResume?: () => void
}

const Board: React.FC<BoardProps> = ({
  cards,
  selectedCards,
  rejectedCards = [],
  foundCards = [],
  completedCards = [],
  autoFilledCard = null,
  completedLeaving = false,
  completedTone = 'found',
  onCardClick,
  claiming,
  gameOver = false,
  gameOverContent,
  gameOverLabel = 'Round over',
  paused = false,
  pausedNote,
  loading = false,
  onResume
}) => {
  const isRevealingSet = foundCards.length === 3
  const interactionLocked = claiming || gameOver || paused || loading || isRevealingSet || completedCards.length > 0
  // Empty slots keep the board's footprint when there are no cards to show.
  const placeholders = loading || (gameOver && cards.length === 0)

  // Fingers now on a card, by pointer id.
  const presses = useRef(new Map<number, Press>())
  // When a finger last lifted from a card; null once a press has been left to the browser's click since.
  const touchLiftedAt = useRef<number | null>(null)
  // When the page, or anything in it, last scrolled.
  const scrolledAt = useRef(-Infinity)

  useEffect(() => {
    const onScroll = () => { scrolledAt.current = performance.now() }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, true)
  }, [])

  useEffect(() => {
    // Only Safari has gesture events. Elsewhere touch-action is enough, and
    // listeners that can cancel a touch would hold up every scroll and tap.
    if (!('GestureEvent' in window)) return
    // A gesture event doesn't say where the fingers are, so the touch events keep track.
    let cardHeld = false
    // A touch keeps the card it landed on, also once the game has taken that card off the board.
    const onCard = ({ target }: Touch) => target instanceof Element && target.closest('button[data-card-id]') !== null
    const track = (event: TouchEvent) => { cardHeld = Array.from(event.touches).some(onCard) }
    const refuseSecondFinger = (event: TouchEvent) => {
      track(event)
      if (cardHeld && event.touches.length > 1 && event.cancelable) event.preventDefault()
    }
    const refuseGesture = (event: Event) => {
      if (cardHeld && event.cancelable) event.preventDefault()
    }
    // On the document: the second finger may be anywhere on the page. Not
    // passive, or Safari would ignore preventDefault.
    const active = { capture: true, passive: false }
    const passive = { capture: true, passive: true }
    document.addEventListener('touchstart', refuseSecondFinger, active)
    document.addEventListener('touchmove', refuseSecondFinger, active)
    document.addEventListener('touchend', track, passive)
    document.addEventListener('touchcancel', track, passive)
    document.addEventListener('gesturestart', refuseGesture, true)
    document.addEventListener('gesturechange', refuseGesture, true)
    return () => {
      document.removeEventListener('touchstart', refuseSecondFinger, true)
      document.removeEventListener('touchmove', refuseSecondFinger, true)
      document.removeEventListener('touchend', track, true)
      document.removeEventListener('touchcancel', track, true)
      document.removeEventListener('gesturestart', refuseGesture, true)
      document.removeEventListener('gesturechange', refuseGesture, true)
    }
  }, [])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // A mouse or pen, or a finger stopping a scroll: the browser's click decides.
    if (event.pointerType !== 'touch' || performance.now() - scrolledAt.current < SCROLL_SETTLE_MS) {
      touchLiftedAt.current = null
      return
    }
    // No other finger is down, so a press still held here never got its lift.
    if (event.isPrimary) presses.current.clear()
    const card = (event.target as Element).closest<HTMLButtonElement>('button[data-card-id]')
    if (card) presses.current.set(event.pointerId, { card, x: event.clientX, y: event.clientY })
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const press = presses.current.get(event.pointerId)
    if (!press) return
    presses.current.delete(event.pointerId)
    touchLiftedAt.current = performance.now()
    if (interactionLocked || !press.card.isConnected) return
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > TAP_SLOP) return
    onCardClick(Number(press.card.dataset.cardId))
  }

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    presses.current.delete(event.pointerId)
  }

  // The click a browser sends after a finger's tap, already handled when the
  // finger lifted. Safari calls its pointer a mouse, so the time since the lift
  // tells it apart; a keyboard's click (detail 0) is never one.
  const fromTouch = (event: React.MouseEvent) =>
    event.detail !== 0 && touchLiftedAt.current !== null && performance.now() - touchLiftedAt.current < TOUCH_CLICK_MS

  return (
    // Grid geometry stays constant regardless of how many cards are dealt:
    // extra cards simply add rows below, so existing cards never move or resize.
    // The round-over card shares the board's grid cell, so a card taller than
    // the remaining rows grows the board instead of spilling over the page.
    <div className="relative grid w-full" aria-busy={loading}>
      {gameOver && gameOverContent != null && (
        <div className="pointer-events-none z-10 col-start-1 row-start-1 flex items-start justify-center py-6 sm:items-center">
          <div className="pointer-events-auto w-full max-w-xs rounded-2xl border border-neutral-200 bg-white/95 p-5 text-center shadow-lg backdrop-blur dark:border-neutral-600 dark:bg-neutral-900/95">
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{gameOverLabel}</div>
            {gameOverContent}
          </div>
        </div>
      )}

      {/* Paused overlay hides the board and blocks interaction */}
      {paused && !gameOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-neutral-100/70 backdrop-blur-md dark:bg-[#111214]/70">
          <div className="mx-3 flex flex-col items-center gap-3 rounded-2xl border border-neutral-200 bg-white/95 px-6 py-5 text-center shadow-sm dark:border-neutral-600 dark:bg-neutral-900/95">
            <div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Paused</div>
              {pausedNote && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{pausedNote}</p>}
            </div>
            {onResume && <button type="button" onClick={onResume} className="min-h-11 rounded-full bg-neutral-900 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300">Resume game</button>}
          </div>
        </div>
      )}

      <div
        className={`col-start-1 row-start-1 grid grid-cols-3 content-start gap-2 sm:gap-3 lg:grid-cols-4 ${gameOver || paused ? 'opacity-40 saturate-50' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {placeholders ? Array.from({ length: 12 }, (_, index) => (
          <div key={index} aria-hidden="true" className="aspect-[258/167] rounded-xl border border-neutral-200 bg-white/60 dark:border-neutral-700 dark:bg-neutral-900" />
        )) : cards.map((cardId) => {
          const isSelected = selectedCards.includes(cardId)
          const isRejected = rejectedCards.includes(cardId)
          const isFound = foundCards.includes(cardId)
          const isCompleted = completedCards.includes(cardId)
          const isRepeat = isCompleted && completedTone === 'repeat'
          const completedRole = cardId === autoFilledCard ? 'filled' : 'picked'
          const borderStyle = isRepeat
            ? `relative z-[1] border-rose-600 ring-2 ring-rose-600 animate-set-repeat ${DARK_RING.rose}`
            : isRejected
            ? `border-rose-600 ring-2 ring-rose-600 animate-shake ${DARK_RING.rose}`
            : isCompleted
              ? `relative z-[1] border-amber-400 ring-[3px] ring-amber-400 shadow-[0_0_12px_2px_rgba(251,191,36,0.45)] ${completedLeaving ? 'animate-set-leave' : 'animate-set-lit'} dark:shadow-[0_0_14px_3px_rgba(252,211,77,0.4)] ${DARK_RING.amber}`
              : isFound
              ? `relative z-[1] border-emerald-700 ring-2 ring-emerald-700 ${DARK_RING.emerald}`
              : isSelected
                ? `relative z-[1] border-neutral-900 ring-2 ring-neutral-900 ${DARK_RING.amber}`
                : `border-neutral-200 hover:border-neutral-400 dark:border-neutral-500/50 dark:hover:border-neutral-400 ${DARK_FOCUS}`

          return (
            <button
              key={cardId}
              type="button"
              disabled={interactionLocked}
              aria-pressed={isSelected}
              data-completed={isCompleted && !isRepeat ? completedRole : undefined}
              data-repeat={isRepeat ? completedRole : undefined}
              aria-label={describeCard(cardId)}
              data-card-id={cardId}
              onClick={event => { if (!fromTouch(event)) onCardClick(cardId) }}
              className={`animate-card-in block w-full [touch-action:pan-x_pan-y] select-none overflow-hidden rounded-xl border bg-white transition-[border-color,box-shadow,transform] ${isCompleted ? 'duration-0' : 'duration-200'} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-[#f1f0ec] dark:focus-visible:outline-offset-0! ${
                interactionLocked ? 'cursor-default' : 'cursor-pointer active:scale-[0.98]'
              } ${borderStyle}`}
            >
              <CardFace cardId={cardId} decorative className="pointer-events-none h-auto w-full" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default Board
