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
      <h2 className="text-2xl font-semibold mb-4">Board</h2>
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {cards.map(cardId => (
          <div
            key={cardId}
            onClick={() => onCardClick(cardId)}
            className={`cursor-pointer transition-all duration-200 rounded-lg overflow-hidden border-4 ${
              selectedCards.includes(cardId)
                ? 'border-blue-600 shadow-lg scale-105'
                : 'border-gray-300 hover:border-gray-400'
            } ${claiming ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <img
              src={`/cards/${cardId}.png`}
              alt={`Card ${cardId}`}
              className="w-full h-auto"
            />
          </div>
        ))}
      </div>
      
      {cards.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No cards on board. Waiting for next round...
        </div>
      )}
    </div>
  )
}

export default Board

