import React from 'react'
import CardFace, { describeCard } from './CardFace'

interface BoardProps {
  cards: number[]
  selectedCards: number[]
  rejectedCards?: number[]
  foundCards?: number[]
  onCardClick: (cardId: number) => void
  claiming: boolean
  gameOver?: boolean
  /** Shown centered over the dimmed board when the round is over. */
  gameOverContent?: React.ReactNode
  paused?: boolean
  loading?: boolean
  onResume?: () => void
}

const Board: React.FC<BoardProps> = ({
  cards,
  selectedCards,
  rejectedCards = [],
  foundCards = [],
  onCardClick,
  claiming,
  gameOver = false,
  gameOverContent,
  paused = false,
  loading = false,
  onResume
}) => {
  const isRevealingSet = foundCards.length === 3
  const interactionLocked = claiming || gameOver || paused || loading || isRevealingSet

  return (
    // Grid geometry stays constant regardless of how many cards are dealt:
    // extra cards simply add rows below, so existing cards never move or resize.
    <div className={`relative w-full ${gameOver && cards.length === 0 ? 'min-h-64' : ''}`} aria-busy={loading}>
      {/* Round over overlay */}
      {gameOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-6 sm:items-center sm:pt-0">
          <div className="pointer-events-auto w-full max-w-xs rounded-2xl border border-neutral-200 bg-white/95 p-5 text-center shadow-lg backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/95">
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">Round over</div>
            {gameOverContent}
          </div>
        </div>
      )}

      {/* Paused overlay hides the board and blocks interaction */}
      {paused && !gameOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-neutral-100/70 backdrop-blur-md dark:bg-[#111214]/70">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-200 bg-white/95 px-6 py-5 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/95">
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Paused</span>
            {onResume && <button type="button" onClick={onResume} className="min-h-11 rounded-full bg-neutral-900 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300">Resume game</button>}
          </div>
        </div>
      )}

      {loading && <div role="status" className="absolute inset-0 z-10 flex items-center justify-center text-sm font-medium text-neutral-500 dark:text-neutral-400">Dealing cards…</div>}
      <div
        className={`grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4 ${gameOver || paused ? 'opacity-40 saturate-50' : ''}`}
      >
        {loading ? Array.from({ length: 12 }, (_, index) => (
          <div key={index} aria-hidden="true" className="aspect-[258/167] rounded-xl border border-neutral-200 bg-white/60 dark:border-neutral-800 dark:bg-neutral-900" />
        )) : cards.map((cardId) => {
          const isSelected = selectedCards.includes(cardId)
          const isRejected = rejectedCards.includes(cardId)
          const isFound = foundCards.includes(cardId)

          const borderStyle = isRejected
            ? 'border-rose-600 ring-2 ring-rose-600 animate-shake dark:border-rose-400 dark:ring-rose-400'
            : isFound
              ? 'relative z-[1] border-emerald-700 ring-2 ring-emerald-700 dark:border-emerald-400 dark:ring-emerald-400'
              : isSelected
                ? 'relative z-[1] border-neutral-900 ring-2 ring-neutral-900 dark:border-amber-300 dark:ring-amber-300'
                : 'border-neutral-200 hover:border-neutral-400 dark:border-neutral-500/50 dark:hover:border-neutral-400'

          return (
            <button
              key={cardId}
              type="button"
              disabled={interactionLocked}
              aria-pressed={isSelected}
              aria-label={describeCard(cardId)}
              data-card-id={cardId}
              onClick={() => onCardClick(cardId)}
              className={`animate-card-in block w-full touch-manipulation select-none overflow-hidden rounded-xl border bg-white transition-[border-color,box-shadow,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-[#f1f0ec] dark:focus-visible:outline-neutral-100 ${
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
