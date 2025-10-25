import React, { useState, useRef } from 'react'

interface BoardProps {
  cards: number[]
  selectedCards: number[]
  onCardClick: (cardId: number) => void
  claiming: boolean
  gameOver?: boolean
  paused?: boolean
}

const Board: React.FC<BoardProps> = ({ cards, selectedCards, onCardClick, claiming, gameOver = false, paused = false }) => {
  const [pointerState, setPointerState] = useState<{ cardId: number | null; startX: number; startY: number; maxDelta: number }>({
    cardId: null,
    startX: 0,
    startY: 0,
    maxDelta: 0
  })
  const pointerThreshold = 8 // pixels of movement allowed
  
  const handlePointerDown = (e: React.PointerEvent, cardId: number) => {
    if (claiming || gameOver || paused) return
    e.preventDefault()
    setPointerState({
      cardId,
      startX: e.clientX,
      startY: e.clientY,
      maxDelta: 0
    })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointerState.cardId === null) return
    const deltaX = Math.abs(e.clientX - pointerState.startX)
    const deltaY = Math.abs(e.clientY - pointerState.startY)
    const maxDelta = Math.max(deltaX, deltaY)
    setPointerState(prev => ({ ...prev, maxDelta }))
  }

  const handlePointerUp = (e: React.PointerEvent, cardId: number) => {
    if (pointerState.cardId === null) return
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    
    if (pointerState.maxDelta < pointerThreshold && e.button === 0) {
      onCardClick(cardId)
    }
    
    setPointerState({ cardId: null, startX: 0, startY: 0, maxDelta: 0 })
  }

  const handleKeyDown = (e: React.KeyboardEvent, cardId: number) => {
    if (claiming || gameOver || paused) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onCardClick(cardId)
    }
  }

  // Always keep 3 columns; additional cards add rows (15 → 5 rows, 18 → 6 rows)
  // Use max-content tracks so columns size to card width rather than stretching
  const getGridCols = () => 'grid-cols-[repeat(3,max-content)]'

  // Reduce padding and gaps when there are more cards; keep horizontal padding tighter
  const getPaddingAndGap = () => {
    const count = cards.length
    // Tighter defaults on mobile so the grid never crowds the right edge
    if (count <= 12) return { paddingX: 'px-3 md:px-4', paddingY: 'py-5 md:py-6', gap: 'gap-3 md:gap-4' }
    if (count <= 15) return { paddingX: 'px-2 md:px-3', paddingY: 'py-4', gap: 'gap-2 md:gap-3' }
    if (count <= 18) return { paddingX: 'px-2', paddingY: 'py-3', gap: 'gap-2' }
    return { paddingX: 'px-4', paddingY: 'py-6', gap: 'gap-4' }
  }

  const { paddingX, paddingY, gap } = getPaddingAndGap()

  return (
    <div className={`relative bg-white ${paddingY} ${paddingX} rounded-lg shadow-sm w-full max-w-[min(100%,80rem)] mx-auto overflow-x-hidden`}>
      {/* Game over overlay */}
      {gameOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="px-4 py-2 rounded-full bg-white/90 border border-gray-200 shadow text-gray-900 font-semibold">
            Round over
          </div>
        </div>
      )}

      {/* Paused overlay blocks view and interaction */}
      {paused && !gameOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="px-4 py-2 rounded-full bg-white/90 border border-gray-200 shadow text-gray-900 font-semibold">
            Paused
          </div>
        </div>
      )}

      <div className={`grid ${getGridCols()} ${gap} justify-center ${gameOver || paused ? 'opacity-50 saturate-50' : ''}`}>
        {cards.map((cardId, index) => {
          const isSelected = selectedCards.includes(cardId)
          return (
            <div
              key={index}
              role="button"
              tabIndex={claiming || gameOver || paused ? -1 : 0}
              aria-pressed={isSelected}
              onPointerDown={(e) => handlePointerDown(e, cardId)}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => handlePointerUp(e, cardId)}
              onKeyDown={(e) => handleKeyDown(e, cardId)}
              className={`select-none touch-manipulation flex items-center justify-center ${
                claiming || gameOver || paused ? 'cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <div
                className={`rounded-xl overflow-hidden border-2 bg-white aspect-[5/3] w-[clamp(7.25rem,26vw,11rem)] md:w-48 lg:w-56 flex items-center justify-center transition-colors ${
                  isSelected
                    ? 'border-blue-600'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <img
                  src={`/cards/${cardId}.png`}
                  alt={`Card ${cardId}`}
                  loading="eager"
                  decoding="async"
                  draggable={false}
                  className="max-w-full max-h-full object-contain pointer-events-none"
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Board

