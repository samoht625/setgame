import React, { useState, useEffect, useRef } from 'react'
import { consumer } from '../cable'
import Board from './Board'
import Toast from './Toast'
import Scoreboard from './Scoreboard'

interface GameState {
  board: number[]
  deck_count: number
  scores: Record<string, number>
  names: Record<string, string>
  status: string
}

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    board: [],
    deck_count: 0,
    scores: {},
    names: {},
    status: 'playing'
  })
  const [selectedCards, setSelectedCards] = useState<number[]>([])
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string>('')
  const [isConnected, setIsConnected] = useState(false)
  // name editing is inline in Scoreboard now
  const subscriptionRef = useRef<any>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const getToastType = (msg: string): 'success' | 'error' | 'info' => {
    const lower = msg.toLowerCase()
    if (
      lower.includes('error') ||
      lower.includes('not connected') ||
      lower.includes('subscription') ||
      lower.includes('failed') ||
      lower.includes('timed out') ||
      lower.includes('not a valid')
    ) {
      return 'error'
    }
    return 'success'
  }

  useEffect(() => {
    // Subscribe to game channel
    const sub = consumer.subscriptions.create('GameChannel', {
      connected() {
        setIsConnected(true)
      },
      
      disconnected() {
        setIsConnected(false)
        // Clear any pending claim timeout on disconnect
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
      },
      
      received(data: GameState | { error: string } | { your_id: string }) {
        // Any message from server means the request cycle progressed; clear timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        
        if ('your_id' in data) {
          setPlayerId(data.your_id)
          return
        }
        
        if ('error' in data) {
          setMessage(data.error)
          setSelectedCards([])
          setClaiming(false)
          setTimeout(() => setMessage(null), 2000)
        } else {
          if (claiming) {
            setMessage('Set found!')
            setTimeout(() => setMessage(null), 2000)
          }
          setGameState(data)
          setSelectedCards([])
          setClaiming(false)
        }
      }
    })

    // Store subscription reference
    subscriptionRef.current = sub

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      sub.unsubscribe()
    }
  }, [])

  const handleCardClick = (cardId: number) => {
    if (claiming) return
    
    const nextSelected = selectedCards.includes(cardId)
      ? selectedCards.filter(id => id !== cardId)
      : selectedCards.length < 3
        ? [...selectedCards, cardId]
        : selectedCards
    
    setSelectedCards(nextSelected)
    
    // Auto-claim when third card is selected
    if (nextSelected.length === 3) {
      handleClaimSet(nextSelected)
    }
  }

  const updatePlayerName = (name: string) => {
    if (!subscriptionRef.current) return
    subscriptionRef.current.perform('update_name', { name })
  }

  const handleClaimSet = (cardIds?: number[]) => {
    const ids = cardIds ?? selectedCards
    if (ids.length !== 3 || claiming) return
    
    if (!isConnected) {
      setMessage('Not connected to server. Please refresh the page.')
      return
    }
    
    if (!subscriptionRef.current) {
      setMessage('Subscription not available. Please refresh the page.')
      return
    }
    
    if (typeof subscriptionRef.current.perform !== 'function') {
      setMessage('Subscription error. Please refresh the page.')
      return
    }
    
    setClaiming(true)
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    // Set timeout to reset claiming state if no response
    timeoutRef.current = setTimeout(() => {
      setMessage('Request timed out. Please try again.')
      setClaiming(false)
      setSelectedCards([])
      timeoutRef.current = null
    }, 5000)
    
    try {
      subscriptionRef.current.perform('claim_set', { card_ids: ids })
    } catch (error) {
      setMessage('Failed to send claim. Please try again.')
      setClaiming(false)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        {message && (
          <Toast
            message={message}
            type={getToastType(message)}
            onClose={() => setMessage(null)}
          />
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <Board
              cards={gameState.board}
              selectedCards={selectedCards}
              onCardClick={handleCardClick}
              claiming={claiming}
            />
          </div>
          
          <div className="lg:col-span-1">
            <Scoreboard
              scores={gameState.scores}
              names={gameState.names}
              playerId={playerId}
              deckCount={gameState.deck_count}
              status={gameState.status}
              onUpdateName={updatePlayerName}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

