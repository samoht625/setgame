import React from 'react'

interface BoardProps {
  cards: number[]
  selectedCards: number[]
  rejectedCards?: number[]
  foundCards?: number[]
  announcement?: string | null
  onCardClick: (cardId: number) => void
  claiming: boolean
  gameOver?: boolean
  paused?: boolean
}

const Board: React.FC<BoardProps> = ({
  cards,
  selectedCards,
  rejectedCards = [],
  foundCards = [],
  announcement,
  onCardClick,
  claiming,
  gameOver = false,
  paused = false
}) => {
  const isRevealingSet = foundCards.length === 3
  const interactionLocked = claiming || gameOver || paused || isRevealingSet

  return (
    // Grid geometry stays constant regardless of how many cards are dealt:
    // extra cards simply add rows below, so existing cards never move or resize.
    <div className="relative mx-auto w-full max-w-2xl lg:max-w-4xl">
      {announcement !== undefined && (
        <div className="mb-3 flex h-9 items-center justify-center" aria-live="polite" aria-atomic="true">
          {announcement && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-900 shadow-sm dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              {announcement}
            </div>
          )}
        </div>
      )}

      {/* Round over overlay */}
      {gameOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-full border border-neutral-200 bg-white/95 px-5 py-2 text-sm font-semibold text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-100">
            Round over
          </div>
        </div>
      )}

      {/* Paused overlay hides the board and blocks interaction */}
      {paused && !gameOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-neutral-100/70 backdrop-blur-md dark:bg-neutral-950/70">
          <div className="rounded-full border border-neutral-200 bg-white/95 px-5 py-2 text-sm font-semibold text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-900/95 dark:text-neutral-100">
            Paused
          </div>
        </div>
      )}

      <div
        className={`grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4 ${gameOver || paused ? 'opacity-50 saturate-50' : ''}`}
      >
        {cards.map((cardId) => {
          const isSelected = selectedCards.includes(cardId)
          const isRejected = rejectedCards.includes(cardId)
          const isFound = foundCards.includes(cardId)

          const borderStyle = isRejected
            ? 'border-rose-500 ring-2 ring-rose-500/30 animate-shake dark:ring-rose-400/50 dark:shadow-lg dark:shadow-rose-500/20'
            : isFound
              ? 'relative z-[1] -translate-y-0.5 border-emerald-500 ring-4 ring-emerald-500/25 shadow-lg dark:ring-emerald-400/45 dark:shadow-emerald-500/25'
              : isSelected
                ? 'relative z-[1] -translate-y-0.5 border-neutral-900 ring-4 ring-neutral-900/20 shadow-lg dark:border-sky-400 dark:ring-sky-400/55 dark:shadow-lg dark:shadow-sky-500/30'
                : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600'

          return (
            <button
              key={cardId}
              type="button"
              disabled={interactionLocked}
              aria-pressed={isSelected}
              onClick={() => onCardClick(cardId)}
              className={`animate-card-in block w-full touch-manipulation select-none overflow-hidden rounded-xl border-2 bg-white transition-[border-color,box-shadow,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 dark:bg-white dark:focus-visible:outline-neutral-100 ${
                interactionLocked ? 'cursor-default' : 'cursor-pointer active:scale-[0.98]'
              } ${borderStyle}`}
            >
              <img
                src={`/cards/${cardId}.png`}
                alt={`Card ${cardId}`}
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
