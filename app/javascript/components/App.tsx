import React, { useState, useEffect } from 'react'
import { consumer } from '../cable'
import Board from './Board'
import Scoreboard from './Scoreboard'

interface GameState {
  board: number[]
  deck_count: number
  scores: Record<string, number>
  status: string
}

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    board: [],
    deck_count: 0,
    scores: {},
    status: 'playing'
  })
  const [selectedCards, setSelectedCards] = useState<number[]>([])
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string>('')

  useEffect(() => {
    // Subscribe to game channel
    const subscription = consumer.subscriptions.create('GameChannel', {
      connected() {
        console.log('Connected to game channel')
      },
      
      received(data: GameState | { error: string }) {
        if ('error' in data) {
          setMessage(data.error)
          setClaiming(false)
          setTimeout(() => setMessage(null), 3000)
        } else {
          setGameState(data)
          setSelectedCards([])
          setClaiming(false)
        }
      }
    })

    // Store player ID
    setPlayerId(subscription.identifier)

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleCardClick = (cardId: number) => {
    if (claiming) return
    
    setSelectedCards(prev => {
      if (prev.includes(cardId)) {
        return prev.filter(id => id !== cardId)
      } else if (prev.length < 3) {
        return [...prev, cardId]
      }
      return prev
    })
  }

  const handleClaimSet = () => {
    if (selectedCards.length !== 3 || claiming) return
    
    setClaiming(true)
    const subscription = consumer.subscriptions.subscriptions.find(
      (sub: any) => sub.identifier === 'GameChannel'
    )
    
    if (subscription) {
      subscription.send({ claim_set: { card_ids: selectedCards } })
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8">Set Game</h1>
        
        {message && (
          <div className={`mb-4 p-4 rounded ${
            message.includes('error') || message.includes('Not a valid') 
              ? 'bg-red-100 text-red-800' 
              : 'bg-green-100 text-green-800'
          }`}>
            {message}
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <Board
              cards={gameState.board}
              selectedCards={selectedCards}
              onCardClick={handleCardClick}
              claiming={claiming}
            />
            
            {selectedCards.length === 3 && (
              <div className="mt-4 text-center">
                <button
                  onClick={handleClaimSet}
                  disabled={claiming}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {claiming ? 'Claiming...' : 'Claim Set'}
                </button>
              </div>
            )}
          </div>
          
          <div className="lg:col-span-1">
            <Scoreboard
              scores={gameState.scores}
              playerId={playerId}
              deckCount={gameState.deck_count}
              status={gameState.status}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

