import React from 'react'

interface BoardProps {
  cards: number[]
  selectedCards: number[]
  rejectedCards?: number[]
  onCardClick: (cardId: number) => void
  claiming: boolean
  gameOver?: boolean
  paused?: boolean
}

// Column count and width grow with the board so 3 rows stay visible on desktop,
// while mobile always uses a 3-wide grid.
const layoutFor = (count: number) => {
  if (count <= 12) return { cols: 'grid-cols-3 lg:grid-cols-4', maxWidth: 'max-w-2xl lg:max-w-4xl' }
  if (count <= 15) return { cols: 'grid-cols-3 lg:grid-cols-5', maxWidth: 'max-w-2xl lg:max-w-5xl' }
  return { cols: 'grid-cols-3 lg:grid-cols-6', maxWidth: 'max-w-2xl lg:max-w-6xl' }
}

const Board: React.FC<BoardProps> = ({
  cards,
  selectedCards,
  rejectedCards = [],
  onCardClick,
  claiming,
  gameOver = false,
  paused = false
}) => {
  const interactionLocked = claiming || gameOver || paused
  const { cols, maxWidth } = layoutFor(cards.length)

  return (
    <div className={`relative w-full ${maxWidth} mx-auto`}>
      {/* Round over overlay */}
      {gameOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-full border border-neutral-200 bg-white/95 px-5 py-2 text-sm font-semibold text-neutral-900 shadow-sm">
            Round over
          </div>
        </div>
      )}

      {/* Paused overlay hides the board and blocks interaction */}
      {paused && !gameOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-neutral-100/70 backdrop-blur-md">
          <div className="rounded-full border border-neutral-200 bg-white/95 px-5 py-2 text-sm font-semibold text-neutral-900 shadow-sm">
            Paused
          </div>
        </div>
      )}

      <div
        className={`grid ${cols} gap-2 sm:gap-3 ${gameOver || paused ? 'opacity-50 saturate-50' : ''}`}
      >
        {cards.map((cardId) => {
          const isSelected = selectedCards.includes(cardId)
          const isRejected = rejectedCards.includes(cardId)

          const borderStyle = isRejected
            ? 'border-rose-500 ring-2 ring-rose-500/30 animate-shake'
            : isSelected
              ? 'border-neutral-900 ring-2 ring-neutral-900/15 -translate-y-0.5 shadow-md'
              : 'border-neutral-200 hover:border-neutral-300'

          return (
            <button
              key={cardId}
              type="button"
              disabled={interactionLocked}
              aria-pressed={isSelected}
              onClick={() => onCardClick(cardId)}
              className={`block w-full touch-manipulation select-none overflow-hidden rounded-xl border-2 bg-white transition-[border-color,box-shadow,transform] duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900 ${
                interactionLocked ? 'cursor-default' : 'cursor-pointer active:scale-[0.98]'
              } ${borderStyle}`}
            >
              <img
                src={`/cards/${cardId}.png`}
                alt={`Card ${cardId}`}
                loading="eager"
                decoding="async"
                draggable={false}
                className="pointer-events-none aspect-[258/167] w-full object-contain"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default Board
