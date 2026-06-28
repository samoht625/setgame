import React, { useState, useEffect, useRef } from 'react'
import { consumer } from '../cable'
import Board from './Board'
import GameLayout from './GameLayout'
import Toast, { ToastMessage } from './Toast'
import Scoreboard from './Scoreboard'
import { useHeartbeat } from '../hooks/useHeartbeat'

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

interface ActiveClaim {
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
  idle_player_ids: string[]
  countdown: number
  placements: Placement[]
  recent_claims: RecentClaim[]
  active_claim: ActiveClaim | null
  reset_countdown: number
  reset_requested_by: string | null
}

type ServerMessage =
  | GameState
  | { error: string; action?: string }
  | { your_id: string }
  | ({ success: boolean } & GameState)

const EMPTY_STATE: GameState = {
  board: [],
  deck_count: 0,
  scores: {},
  names: {},
  status: 'playing',
  online_player_ids: [],
  idle_player_ids: [],
  countdown: 0,
  placements: [],
  recent_claims: [],
  active_claim: null,
  reset_countdown: 0,
  reset_requested_by: null
}

const MultiplayerGame: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(EMPTY_STATE)
  const [selectedCards, setSelectedCards] = useState<number[]>([])
  const [rejectedCards, setRejectedCards] = useState<number[]>([])
  const [claiming, setClaiming] = useState(false)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [playerId, setPlayerId] = useState<string>('')
  const [isConnected, setIsConnected] = useState(false)

  const subscriptionRef = useRef<any>(null)
  const claimTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rejectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selectedCardsRef = useRef<number[]>([])
  const pushedStoredNameRef = useRef(false)

  useEffect(() => {
    selectedCardsRef.current = selectedCards
  }, [selectedCards])

  const showToast = (text: string, type: ToastMessage['type']) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast({ text, type })
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2500)
  }

  const clearClaimTimeout = () => {
    if (claimTimeoutRef.current) {
      clearTimeout(claimTimeoutRef.current)
      claimTimeoutRef.current = null
    }
  }

  const flashRejection = (cards: number[]) => {
    if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)
    setRejectedCards(cards)
    rejectTimeoutRef.current = setTimeout(() => setRejectedCards([]), 650)
  }

  useEffect(() => {
    const sub = consumer.subscriptions.create('GameChannel', {
      connected() {
        setIsConnected(true)
      },

      disconnected() {
        setIsConnected(false)
        clearClaimTimeout()
        setClaiming(false)
      },

      received(data: ServerMessage) {
        if ('your_id' in data) {
          setPlayerId(data.your_id)
          return
        }

        if ('error' in data) {
          showToast(data.error, 'error')
          if (data.action !== 'reset') {
            // Response to one of our own claims failed
            clearClaimTimeout()
            flashRejection(selectedCardsRef.current)
            setSelectedCards([])
            setClaiming(false)
          }
          return
        }

        if ('success' in data && data.success) {
          // Our own claim succeeded
          clearClaimTimeout()
          setGameState(data)
          setSelectedCards([])
          setClaiming(false)
          return
        }

        // Broadcast (other players' claims, presence updates, new rounds, ...)
        // Keep our pending claim/timeout untouched; only drop selected cards
        // that are no longer on the board.
        const state = data as GameState
        setGameState(state)
        setSelectedCards(prev => (
          state.active_claim ? [] : prev.filter(id => state.board.includes(id))
        ))
      }
    })

    subscriptionRef.current = sub

    return () => {
      clearClaimTimeout()
      if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      sub.unsubscribe()
      subscriptionRef.current = null
      // Close the socket so we don't appear online while playing solo
      consumer.disconnect()
    }
  }, [])

  // Manage presence heartbeats
  useHeartbeat(subscriptionRef, isConnected)

  // Restore a locally persisted display name once we know who we are.
  useEffect(() => {
    if (pushedStoredNameRef.current) return
    if (!playerId || !subscriptionRef.current) return
    const currentName = gameState.names[playerId]
    if (currentName === undefined) return

    pushedStoredNameRef.current = true
    try {
      const perIdKey = `setgame_player_name:${playerId}`
      const stored = localStorage.getItem(perIdKey) || localStorage.getItem('setgame_name') || ''
      if (stored && stored !== currentName) {
        subscriptionRef.current.perform('update_name', { name: stored })
      }
    } catch (_) {
      // ignore storage failures
    }
  }, [playerId, gameState.names])

  const updatePlayerName = (name: string) => {
    if (!subscriptionRef.current) return
    try {
      const key = playerId ? `setgame_player_name:${playerId}` : 'setgame_player_name'
      localStorage.setItem(key, name)
    } catch (_) {
      // ignore storage failures
    }
    subscriptionRef.current.perform('update_name', { name })
  }

  const performResetAction = (action: 'request_reset' | 'cancel_reset') => {
    if (!isConnected || !subscriptionRef.current || typeof subscriptionRef.current.perform !== 'function') {
      showToast('Not connected to the game. Trying to reconnect…', 'error')
      return
    }

    try {
      subscriptionRef.current.perform(action)
    } catch (_) {
      showToast('Failed to send reset request. Please try again.', 'error')
    }
  }

  const handleClaimSet = (cardIds: number[]) => {
    if (cardIds.length !== 3 || claiming || gameState.active_claim) return

    if (!isConnected || !subscriptionRef.current || typeof subscriptionRef.current.perform !== 'function') {
      showToast('Not connected to the game. Trying to reconnect…', 'error')
      setSelectedCards([])
      return
    }

    setClaiming(true)

    // Reset claiming if the server never answers our claim
    clearClaimTimeout()
    claimTimeoutRef.current = setTimeout(() => {
      claimTimeoutRef.current = null
      showToast('Request timed out. Please try again.', 'error')
      setClaiming(false)
      setSelectedCards([])
    }, 5000)

    try {
      subscriptionRef.current.perform('claim_set', { card_ids: cardIds })
    } catch (error) {
      clearClaimTimeout()
      showToast('Failed to send claim. Please try again.', 'error')
      setClaiming(false)
    }
  }

  const handleCardClick = (cardId: number) => {
    if (claiming || gameState.active_claim || gameState.status !== 'playing') return

    const nextSelected = selectedCards.includes(cardId)
      ? selectedCards.filter(id => id !== cardId)
      : selectedCards.length < 3
        ? [...selectedCards, cardId]
        : selectedCards

    setSelectedCards(nextSelected)

    // Auto-claim when the third card is selected
    if (nextSelected.length === 3) {
      handleClaimSet(nextSelected)
    }
  }

  const activeClaim = gameState.active_claim
  const announcement = activeClaim
    ? activeClaim.player_id === playerId
      ? 'You found a set!'
      : `${gameState.names[activeClaim.player_id] || 'A player'} found a set!`
    : null

  return (
    <>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <GameLayout
        board={
          <Board
            cards={gameState.board}
            selectedCards={selectedCards}
            rejectedCards={rejectedCards}
            foundCards={activeClaim?.cards || []}
            announcement={announcement}
            onCardClick={handleCardClick}
            claiming={claiming}
            gameOver={gameState.status === 'round_over'}
          />
        }
        sidebar={
          <Scoreboard
            scores={gameState.scores}
            names={gameState.names}
            playerId={playerId}
            deckCount={gameState.deck_count}
            status={gameState.status}
            onlinePlayerIds={gameState.online_player_ids}
            idlePlayerIds={gameState.idle_player_ids}
            countdown={gameState.countdown}
            placements={gameState.placements}
            recentClaims={gameState.recent_claims || []}
            resetCountdown={gameState.reset_countdown || 0}
            resetRequestedBy={gameState.reset_requested_by || null}
            isConnected={isConnected}
            onUpdateName={updatePlayerName}
            onRequestReset={() => performResetAction('request_reset')}
            onCancelReset={() => performResetAction('cancel_reset')}
          />
        }
      />
    </>
  )
}

export default MultiplayerGame
