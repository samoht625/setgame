import React from 'react'
import { cardAttributes } from '../lib/rules'

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

function describeCard(cardId: number): string {
  const { number, color, shape, shading } = cardAttributes(cardId)
  const shapeName = ['squiggle', 'diamond', 'oval'][shape]
  return `${number + 1} ${['solid', 'striped', 'open'][shading]} ${['red', 'purple', 'green'][color]} ${shapeName}${number === 0 ? '' : 's'}`
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
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-neutral-100/70 backdrop-blur-md dark:bg-neutral-950/70">
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
            ? 'border-rose-500 ring-2 ring-rose-500/30 animate-shake dark:ring-rose-400/50 dark:shadow-lg dark:shadow-rose-500/20'
            : isFound
              ? 'relative z-[1] -translate-y-0.5 border-emerald-500 ring-4 ring-emerald-500/25 shadow-lg dark:ring-emerald-400/45 dark:shadow-emerald-500/25'
              : isSelected
                ? 'relative z-[1] -translate-y-0.5 border-neutral-900 ring-4 ring-neutral-900/20 shadow-lg dark:border-amber-500 dark:ring-amber-400/60 dark:shadow-lg dark:shadow-amber-500/35'
                : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600'

          return (
            <button
              key={cardId}
              type="button"
              disabled={interactionLocked}
              aria-pressed={isSelected}
              aria-label={describeCard(cardId)}
              data-card-id={cardId}
              onClick={() => onCardClick(cardId)}
              className={`animate-card-in block w-full touch-manipulation select-none overflow-hidden rounded-xl border-2 bg-white transition-[border-color,box-shadow,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-white dark:focus-visible:outline-neutral-100 ${
                interactionLocked ? 'cursor-default' : 'cursor-pointer active:scale-[0.98]'
              } ${borderStyle}`}
            >
              <img
                src={`/cards/${cardId}.png`}
                alt=""
                width={258}
                height={167}
                loading="eager"
                decoding="async"
                draggable={false}
                className="pointer-events-none aspect-[258/167] w-full bg-white object-contain"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default Board
