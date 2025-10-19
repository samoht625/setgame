import React, { useState, useEffect, useRef } from 'react'
import { consumer } from '../cable'
import Board from './Board'
import Scoreboard from './Scoreboard'
import Toast from './Toast'

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
    console.log('[App] Setting up WebSocket subscription')
    console.log('[App] Consumer object:', consumer)
    console.log('[App] Consumer subscriptions:', consumer.subscriptions)
    
    // Add global error handlers
    const handleError = (e: ErrorEvent) => {
      console.error('[GLOBAL ERROR]', e.error, e.message)
    }
    
    const handleRejection = (e: PromiseRejectionEvent) => {
      console.error('[UNHANDLED REJECTION]', e.reason)
    }
    
    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)
    
    // Subscribe to game channel
    const sub = consumer.subscriptions.create('GameChannel', {
      connected() {
        console.log('[App] Connected to game channel')
        console.log('[App] Subscription identifier:', JSON.stringify(sub.identifier))
        console.log('[App] Subscription object:', sub)
        console.log('[App] Has perform method:', typeof sub.perform === 'function')
        setIsConnected(true)
      },
      
      disconnected() {
        console.log('[App] Disconnected from game channel')
        setIsConnected(false)
        // Clear any pending claim timeout on disconnect
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
      },
      
      received(data: GameState | { error: string } | { your_id: string }) {
        console.log('[App] Received data:', data)
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
          console.log('[App] Received error message:', data.error)
          setMessage(data.error)
          setClaiming(false)
          setTimeout(() => setMessage(null), 3000)
        } else {
          console.log('[App] Received game state update')
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
    console.log('[App] Subscription created and stored in ref')
    console.log('[App] Subscription ref value:', subscriptionRef.current)

    return () => {
      console.log('[App] Cleaning up subscription')
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      sub.unsubscribe()
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

  const updatePlayerName = (name: string) => {
    if (!subscriptionRef.current) return
    subscriptionRef.current.perform('update_name', { name })
  }

  const handleClaimSet = () => {
    if (selectedCards.length !== 3 || claiming) return
    
    console.log('[handleClaimSet] Called with cards:', selectedCards)
    console.log('[handleClaimSet] Is connected:', isConnected)
    console.log('[handleClaimSet] Subscription ref:', subscriptionRef.current)
    
    if (!isConnected) {
      console.error('[handleClaimSet] ERROR: Not connected to game channel')
      setMessage('Not connected to server. Please refresh the page.')
      return
    }
    
    if (!subscriptionRef.current) {
      console.error('[handleClaimSet] ERROR: No subscription available')
      setMessage('Subscription not available. Please refresh the page.')
      return
    }
    
    // Check if perform method exists
    if (typeof subscriptionRef.current.perform !== 'function') {
      console.error('[handleClaimSet] ERROR: perform is not a function')
      console.error('[handleClaimSet] Subscription object:', subscriptionRef.current)
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
      console.error('[handleClaimSet] TIMEOUT: No response received after 5 seconds')
      setMessage('Request timed out. Please try again.')
      setClaiming(false)
      setSelectedCards([])
      timeoutRef.current = null
    }, 5000)
    
    try {
      console.log('[handleClaimSet] Performing claim_set action:', { card_ids: selectedCards })
      console.log('[handleClaimSet] Subscription details:', {
        identifier: subscriptionRef.current.identifier,
        connection: subscriptionRef.current.connection,
        hasPerform: typeof subscriptionRef.current.perform === 'function'
      })
      
      // Use ActionCable perform to invoke channel method `claim_set`
      const result = subscriptionRef.current.perform('claim_set', { card_ids: selectedCards })
      console.log('[handleClaimSet] Perform dispatched successfully, result:', result)
    } catch (error) {
      console.error('[handleClaimSet] ERROR sending message:', error)
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
        <h1 className="text-4xl font-bold text-center mb-8">Set Game</h1>
        
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

