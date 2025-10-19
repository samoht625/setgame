import React from 'react'

interface BoardProps {
  cards: number[]
  selectedCards: number[]
  onCardClick: (cardId: number) => void
  claiming: boolean
}

const Board: React.FC<BoardProps> = ({ cards, selectedCards, onCardClick, claiming }) => {
  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map(cardId => (
          <div
            key={cardId}
            onClick={() => onCardClick(cardId)}
            className={`group cursor-pointer transition-transform duration-150 rounded-xl overflow-hidden border-2 ${
              selectedCards.includes(cardId)
                ? 'border-blue-600 ring-4 ring-blue-200 scale-[1.02]'
                : 'border-gray-200 hover:border-gray-300 hover:scale-[1.01]'
            } ${claiming ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="aspect-[5/3] bg-white flex items-center justify-center">
              <img
                src={`/cards/${cardId}.png`}
                alt={`Card ${cardId}`}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Board

