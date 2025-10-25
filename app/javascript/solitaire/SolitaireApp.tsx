import React, { useState, useEffect, useRef } from 'react'
import Board from '../components/Board'
import Toast from '../components/Toast'
import SolitaireSidebar from './SolitaireSidebar'
import { isSet, setExists } from '../lib/rules'

const LOCAL_STORAGE_KEY = 'setgame_solo_state_v1'

interface RecentClaim {
  cards: number[]
}

type SavedSoloState = {
  board: number[]
  deck: number[]
  status: 'playing' | 'paused' | 'round_over'
  recentClaims: RecentClaim[]
  startedAtMs: number
  elapsedMs: number
}

function loadSavedGame(): SavedSoloState | null {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!stored) return null
    
    const parsed = JSON.parse(stored) as SavedSoloState
    
    // Validate structure
    if (
      !Array.isArray(parsed.board) ||
      !Array.isArray(parsed.deck) ||
      (parsed.status !== 'playing' && parsed.status !== 'paused' && parsed.status !== 'round_over') ||
      !Array.isArray(parsed.recentClaims) ||
      typeof parsed.startedAtMs !== 'number' ||
      typeof parsed.elapsedMs !== 'number'
    ) {
      return null
    }
    
    return parsed
  } catch {
    return null
  }
}

function saveGame(state: SavedSoloState): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage failures
  }
}

const SolitaireApp: React.FC = () => {
  const [board, setBoard] = useState<number[]>([])
  const [deck, setDeck] = useState<number[]>([])
  const [status, setStatus] = useState<'playing' | 'paused' | 'round_over'>('playing')
  const [selectedCards, setSelectedCards] = useState<number[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [recentClaims, setRecentClaims] = useState<RecentClaim[]>([])
  const [startedAtMs, setStartedAtMs] = useState<number>(Date.now())
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const shuffle = (array: number[]): number[] => {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  const dealCards = (count: number, deckToUse: number[], boardToUse: number[]): { deck: number[], board: number[] } => {
    const newDeck = [...deckToUse]
    const newBoard = [...boardToUse]
    
    for (let i = 0; i < count && newDeck.length > 0; i++) {
      newBoard.push(newDeck.shift()!)
    }
    
    return { deck: newDeck, board: newBoard }
  }

  const startNewGame = () => {
    // Initialize deck
    const newDeck = shuffle(Array.from({ length: 81 }, (_, i) => i + 1))
    
    // Deal 12 cards
    let { deck: d, board: b } = dealCards(12, newDeck, [])
    
    // If no set exists, add 3 more cards (up to 15, then 18)
    while (b.length < 18 && !setExists(b)) {
      const result = dealCards(3, d, b)
      d = result.deck
      b = result.board
    }
    
    // If still no sets at 18 cards, reshuffle and redeal
    if (b.length >= 18 && !setExists(b)) {
      const pool = shuffle([...b, ...d])
      d = pool
      b = []
      
      const result = dealCards(12, d, b)
      d = result.deck
      b = result.board
      
      // If still no sets, add more cards up to 18
      while (b.length < 18 && !setExists(b) && d.length > 0) {
        const nextResult = dealCards(3, d, b)
        d = nextResult.deck
        b = nextResult.board
      }
    }
    
    const now = Date.now()
    setBoard(b)
    setDeck(d)
    setStatus('playing')
    setSelectedCards([])
    setElapsedMs(0)
    setRecentClaims([])
    setStartedAtMs(now)
    
    // Persist the new game state
    saveGame({
      board: b,
      deck: d,
      status: 'playing',
      recentClaims: [],
      startedAtMs: now,
      elapsedMs: 0
    })
  }

  const claimSet = (cardIds: number[]) => {
    if (cardIds.length !== 3) {
      setMessage('Must select exactly 3 cards')
      setTimeout(() => setMessage(null), 2000)
      setSelectedCards([])
      return
    }

    // Check if it's a valid set
    if (!isSet(cardIds[0], cardIds[1], cardIds[2])) {
      setMessage('Not a valid set')
      setTimeout(() => setMessage(null), 2000)
      setSelectedCards([])
      return
    }

    // Apply game logic
    let newBoard = [...board]
    let newDeck = [...deck]
    const preLength = newBoard.length

    // If we were at 15 cards, collapse back to 12 by removing the set
    if (preLength >= 15) {
      cardIds.forEach(id => {
        const idx = newBoard.indexOf(id)
        if (idx !== -1) {
          newBoard.splice(idx, 1)
        }
      })
    } else {
      // Otherwise, replace cards in place
      cardIds.forEach(id => {
        const idx = newBoard.indexOf(id)
        if (idx !== -1) {
          if (newDeck.length > 0) {
            newBoard[idx] = newDeck.shift()!
          } else {
            newBoard.splice(idx, 1)
          }
        }
      })
    }

    // If no set exists and we have cards left, add more
    while (newBoard.length < 18 && !setExists(newBoard) && newDeck.length > 0) {
      const result = dealCards(3, newDeck, newBoard)
      newDeck = result.deck
      newBoard = result.board
    }

    // If still no sets at 18 cards, reshuffle and redeal
    if (newBoard.length >= 18 && !setExists(newBoard)) {
      const pool = shuffle([...newBoard, ...newDeck])
      newDeck = pool
      newBoard = []
      
      const result = dealCards(12, newDeck, newBoard)
      newDeck = result.deck
      newBoard = result.board
      
      // If still no sets, add more cards up to 18
      while (newBoard.length < 18 && !setExists(newBoard) && newDeck.length > 0) {
        const nextResult = dealCards(3, newDeck, newBoard)
        newDeck = nextResult.deck
        newBoard = nextResult.board
      }
    }

    setBoard(newBoard)
    setDeck(newDeck)
    setSelectedCards([])
    setMessage('Set found!')
    setTimeout(() => setMessage(null), 2000)
    
    // Add to recent claims (newest first, keep last 8)
    const updatedRecentClaims = [{ cards: cardIds }, ...recentClaims].slice(0, 8)
    setRecentClaims(updatedRecentClaims)

    // Check if round is over (deck empty and no sets on board)
    if (newDeck.length === 0 && !setExists(newBoard)) {
      const finalElapsed = Date.now() - startedAtMs
      setStatus('round_over')
      setElapsedMs(finalElapsed)
      
      // Persist final state
      saveGame({
        board: newBoard,
        deck: newDeck,
        status: 'round_over',
        recentClaims: updatedRecentClaims,
        startedAtMs: startedAtMs,
        elapsedMs: finalElapsed
      })
      
      // Save best time
      try {
        const times = JSON.parse(localStorage.getItem('setgame_solo_best_times') || '[]')
        times.push({ ms: finalElapsed, at: new Date().toISOString() })
        times.sort((a: { ms: number }, b: { ms: number }) => a.ms - b.ms)
        localStorage.setItem('setgame_solo_best_times', JSON.stringify(times.slice(0, 10)))
      } catch {
        // Ignore storage failures
      }
    }
  }

  const handleCardClick = (cardId: number) => {
    if (status !== 'playing') return
    
    const nextSelected = selectedCards.includes(cardId)
      ? selectedCards.filter(id => id !== cardId)
      : selectedCards.length < 3
        ? [...selectedCards, cardId]
        : selectedCards
    
    setSelectedCards(nextSelected)
    
    // Auto-claim when third card is selected
    if (nextSelected.length === 3) {
      claimSet(nextSelected)
    }
  }

  // Start timer
  useEffect(() => {
    if (status === 'playing') {
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtMs)
      }, 100)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [status, startedAtMs])

  // Initialize game on mount - restore saved state or start new game
  useEffect(() => {
    const saved = loadSavedGame()
    if (saved) {
      setBoard(saved.board)
      setDeck(saved.deck)
      setStatus(saved.status)
      setRecentClaims(saved.recentClaims)
      setStartedAtMs(saved.startedAtMs)
      
      // Calculate elapsed time correctly for playing games
      if (saved.status === 'playing') {
        setElapsedMs(Date.now() - saved.startedAtMs)
      } else if (saved.status === 'paused') {
        setElapsedMs(saved.elapsedMs)
      } else {
        setElapsedMs(saved.elapsedMs)
      }
    } else {
      startNewGame()
    }
  }, [])

  // Persist state changes (not on every 100ms tick)
  useEffect(() => {
    const elapsedToPersist = status === 'playing' ? Date.now() - startedAtMs : elapsedMs
    saveGame({
      board,
      deck,
      status,
      recentClaims,
      startedAtMs,
      elapsedMs: elapsedToPersist
    })
  }, [board, deck, status, recentClaims, startedAtMs])

  const getToastType = (msg: string): 'success' | 'error' | 'info' => {
    const lower = msg.toLowerCase()
    if (
      lower.includes('error') ||
      lower.includes('not a valid')
    ) {
      return 'error'
    }
    return 'success'
  }

  const togglePause = () => {
    if (status === 'playing') {
      const nowElapsed = Date.now() - startedAtMs
      setElapsedMs(nowElapsed)
      setStatus('paused')
      setSelectedCards([])
    } else if (status === 'paused') {
      const newStart = Date.now() - elapsedMs
      setStartedAtMs(newStart)
      setStatus('playing')
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
              cards={board}
              selectedCards={selectedCards}
              onCardClick={handleCardClick}
              claiming={false}
              gameOver={status === 'round_over'}
              paused={status === 'paused'}
            />
          </div>
          
          <div className="lg:col-span-1">
            <SolitaireSidebar
              elapsedMs={elapsedMs}
              deckCount={deck.length}
              isFinished={status === 'round_over'}
              onRestartRound={startNewGame}
              recentClaims={recentClaims}
              isPaused={status === 'paused'}
              onTogglePause={togglePause}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default SolitaireApp

