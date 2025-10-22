import React, { useState, useEffect, useRef } from 'react'
import { consumer } from '../cable'
import Board from './Board'
import Toast from './Toast'
import Scoreboard from './Scoreboard'

interface Placement {
  player_id: string
  name: string
  score: number
  place: number
}

interface RecentClaim {
  player_id: string
  cards: number[]
}

interface GameState {
  board: number[]
  deck_count: number
  scores: Record<string, number>
  names: Record<string, string>
  status: string
  online_player_ids: string[]
  countdown: number
  placements: Placement[]
  recent_claims: RecentClaim[]
}

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    board: [],
    deck_count: 0,
    scores: {},
    names: {},
    status: 'playing',
    online_player_ids: [],
    countdown: 0,
    placements: [],
    recent_claims: []
  })
  const [selectedCards, setSelectedCards] = useState<number[]>([])
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string>('')
  const [isConnected, setIsConnected] = useState(false)
  // name editing is inline in Scoreboard now
  const subscriptionRef = useRef<any>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const claimingRef = useRef(false)

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
        
        // Immediately send a heartbeat to establish presence as a real JS client
        try {
          ;(this as any).perform('heartbeat', {})
        } catch (_) {
          // ignore if perform isn't available yet
        }
        
        // Start heartbeat interval (5 seconds)
        heartbeatIntervalRef.current = setInterval(() => {
          if (subscriptionRef.current) {
            subscriptionRef.current.perform('heartbeat', {})
          }
        }, 5000)
      },
      
      disconnected() {
        setIsConnected(false)
        
        // Clear heartbeat interval
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current)
          heartbeatIntervalRef.current = null
        }
        
        // Clear any pending claim timeout on disconnect
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
      },
      
      received(data: GameState | { error: string } | { your_id: string } | { success: boolean } & GameState) {
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
          claimingRef.current = false
          setTimeout(() => setMessage(null), 2000)
        } else if ('success' in data && data.success) {
          // Success response to our own claim
          setMessage('Set found!')
          setTimeout(() => setMessage(null), 2000)
          setGameState(data)
          setSelectedCards([])
          setClaiming(false)
          claimingRef.current = false
        } else {
          // Broadcast from other players' claims or other state updates
          setGameState(data)
          setSelectedCards([])
          setClaiming(false)
          claimingRef.current = false
        }
      }
    })

    // Store subscription reference
    subscriptionRef.current = sub

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
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
    // Persist locally so names survive reloads/restarts/deploys from the client side
    try {
      const key = playerId ? `setgame_player_name:${playerId}` : 'setgame_player_name'
      localStorage.setItem(key, name)
    } catch (_) {
      // ignore storage failures
    }
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
    claimingRef.current = true
    
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    // Set timeout to reset claiming state if no response
    timeoutRef.current = setTimeout(() => {
      setMessage('Request timed out. Please try again.')
      setClaiming(false)
      claimingRef.current = false
      setSelectedCards([])
      timeoutRef.current = null
    }, 5000)
    
    try {
      subscriptionRef.current.perform('claim_set', { card_ids: ids })
    } catch (error) {
      setMessage('Failed to send claim. Please try again.')
      setClaiming(false)
      claimingRef.current = false
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }

  return (
    <div className="min-h-dvh bg-gray-100 px-3 pt-4 pb-safe md:p-8">
      <div className="max-w-7xl mx-auto">
        {message && (
          <Toast
            message={message}
            type={getToastType(message)}
            onClose={() => setMessage(null)}
          />
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 md:gap-8">
          <div className="lg:col-span-3">
            <Board
              cards={gameState.board}
              selectedCards={selectedCards}
              onCardClick={handleCardClick}
              claiming={claiming}
              gameOver={gameState.status !== 'playing'}
            />
          </div>
          
          <div className="lg:col-span-1">
            <Scoreboard
              scores={gameState.scores}
              names={gameState.names}
              playerId={playerId}
              deckCount={gameState.deck_count}
              status={gameState.status}
              onlinePlayerIds={gameState.online_player_ids}
              countdown={gameState.countdown}
              placements={gameState.placements}
              recentClaims={gameState.recent_claims || []}
              onUpdateName={updatePlayerName}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default App

