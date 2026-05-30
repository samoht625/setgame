import React, { useState, useEffect, useRef } from 'react'
import Board from '../components/Board'
import GameLayout from '../components/GameLayout'
import Toast, { ToastMessage } from '../components/Toast'
import SolitaireSidebar from './SolitaireSidebar'
import { isSet, setExists } from '../lib/rules'

const LOCAL_STORAGE_KEY = 'setgame_solo_state_v1'
const BEST_TIMES_KEY = 'setgame_solo_best_times'
const PERSIST_INTERVAL_MS = 5000

interface RecentClaim {
  cards: number[]
}

export type SoloStatus = 'playing' | 'paused' | 'round_over'

type SavedSoloState = {
  board: number[]
  deck: number[]
  status: SoloStatus
  recentClaims: RecentClaim[]
  startedAtMs: number
  elapsedMs: number
  setsFound?: number
}

function loadSavedGame(): SavedSoloState | null {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (!stored) return null

    const parsed = JSON.parse(stored) as SavedSoloState

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

function shuffle(array: number[]): number[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function dealCards(count: number, deckToUse: number[], boardToUse: number[]): { deck: number[]; board: number[] } {
  const newDeck = [...deckToUse]
  const newBoard = [...boardToUse]

  for (let i = 0; i < count && newDeck.length > 0; i++) {
    newBoard.push(newDeck.shift()!)
  }

  return { deck: newDeck, board: newBoard }
}

// Deal a fresh game: 12 cards, extended to 15/18 until a set exists,
// reshuffling if even 18 cards contain no set.
function dealNewGame(): { board: number[]; deck: number[] } {
  let d = shuffle(Array.from({ length: 81 }, (_, i) => i + 1))
  let b: number[] = []

  const dealUntilSetExists = () => {
    const initial = dealCards(12, d, b)
    d = initial.deck
    b = initial.board
    while (b.length < 18 && !setExists(b) && d.length > 0) {
      const result = dealCards(3, d, b)
      d = result.deck
      b = result.board
    }
  }

  dealUntilSetExists()

  if (b.length >= 18 && !setExists(b)) {
    d = shuffle([...b, ...d])
    b = []
    dealUntilSetExists()
  }

  return { board: b, deck: d }
}

const SolitaireGame: React.FC = () => {
  const [board, setBoard] = useState<number[]>([])
  const [deck, setDeck] = useState<number[]>([])
  const [status, setStatus] = useState<SoloStatus>('playing')
  const [selectedCards, setSelectedCards] = useState<number[]>([])
  const [rejectedCards, setRejectedCards] = useState<number[]>([])
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [recentClaims, setRecentClaims] = useState<RecentClaim[]>([])
  const [setsFound, setSetsFound] = useState(0)
  const [startedAtMs, setStartedAtMs] = useState<number>(Date.now())

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rejectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPersistAtRef = useRef(0)
  const initializedRef = useRef(false)

  // Keep the latest state in a ref so persistence helpers never read stale values
  const stateRef = useRef({ board, deck, status, recentClaims, startedAtMs, elapsedMs, setsFound })
  stateRef.current = { board, deck, status, recentClaims, startedAtMs, elapsedMs, setsFound }

  const persistNow = () => {
    if (!initializedRef.current) return
    const s = stateRef.current
    if (s.board.length === 0 && s.deck.length === 0) return
    const elapsedToPersist = s.status === 'playing' ? Date.now() - s.startedAtMs : s.elapsedMs
    saveGame({
      board: s.board,
      deck: s.deck,
      status: s.status,
      recentClaims: s.recentClaims,
      startedAtMs: s.startedAtMs,
      elapsedMs: elapsedToPersist,
      setsFound: s.setsFound
    })
    lastPersistAtRef.current = Date.now()
  }

  const showToast = (text: string, type: ToastMessage['type']) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast({ text, type })
    toastTimeoutRef.current = setTimeout(() => setToast(null), 2000)
  }

  const flashRejection = (cards: number[]) => {
    if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)
    setRejectedCards(cards)
    rejectTimeoutRef.current = setTimeout(() => setRejectedCards([]), 650)
  }

  const startNewGame = () => {
    const { board: b, deck: d } = dealNewGame()
    const now = Date.now()

    setBoard(b)
    setDeck(d)
    setStatus('playing')
    setSelectedCards([])
    setRejectedCards([])
    setElapsedMs(0)
    setRecentClaims([])
    setSetsFound(0)
    setStartedAtMs(now)

    initializedRef.current = true
    saveGame({
      board: b,
      deck: d,
      status: 'playing',
      recentClaims: [],
      startedAtMs: now,
      elapsedMs: 0,
      setsFound: 0
    })
    lastPersistAtRef.current = now
  }

  const recordBestTime = (finalElapsed: number) => {
    try {
      const times = JSON.parse(localStorage.getItem(BEST_TIMES_KEY) || '[]')
      times.push({ ms: finalElapsed, at: new Date().toISOString() })
      times.sort((a: { ms: number }, b: { ms: number }) => a.ms - b.ms)
      localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(times.slice(0, 10)))
    } catch {
      // Ignore storage failures
    }
  }

  const claimSet = (cardIds: number[]) => {
    if (cardIds.length !== 3) return

    if (!isSet(cardIds[0], cardIds[1], cardIds[2])) {
      showToast('Not a valid set', 'error')
      flashRejection(cardIds)
      setSelectedCards([])
      return
    }

    let newBoard = [...board]
    let newDeck = [...deck]

    if (newBoard.length >= 15) {
      // Collapse back down by removing the set without replacement
      cardIds.forEach(id => {
        const idx = newBoard.indexOf(id)
        if (idx !== -1) newBoard.splice(idx, 1)
      })
    } else {
      // Replace cards in place to preserve positions
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
      newDeck = shuffle([...newBoard, ...newDeck])
      newBoard = []

      const result = dealCards(12, newDeck, newBoard)
      newDeck = result.deck
      newBoard = result.board

      while (newBoard.length < 18 && !setExists(newBoard) && newDeck.length > 0) {
        const nextResult = dealCards(3, newDeck, newBoard)
        newDeck = nextResult.deck
        newBoard = nextResult.board
      }
    }

    const updatedRecentClaims = [{ cards: cardIds }, ...recentClaims].slice(0, 8)

    setBoard(newBoard)
    setDeck(newDeck)
    setSelectedCards([])
    setRecentClaims(updatedRecentClaims)
    setSetsFound(prev => prev + 1)
    showToast('Set found!', 'success')

    // Round over: deck empty and no sets left on the board
    if (newDeck.length === 0 && !setExists(newBoard)) {
      const finalElapsed = Date.now() - startedAtMs
      setStatus('round_over')
      setElapsedMs(finalElapsed)
      recordBestTime(finalElapsed)
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

    if (nextSelected.length === 3) {
      claimSet(nextSelected)
    }
  }

  const togglePause = () => {
    if (status === 'playing') {
      setElapsedMs(Date.now() - startedAtMs)
      setStatus('paused')
      setSelectedCards([])
    } else if (status === 'paused') {
      setStartedAtMs(Date.now() - elapsedMs)
      setStatus('playing')
    }
  }

  // Timer: tick while playing, persist every few seconds so progress survives reloads
  useEffect(() => {
    if (status === 'playing') {
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtMs)
        if (Date.now() - lastPersistAtRef.current > PERSIST_INTERVAL_MS) {
          persistNow()
        }
      }, 100)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [status, startedAtMs])

  // Restore saved game (or start a new one) on mount
  useEffect(() => {
    const saved = loadSavedGame()
    if (saved && (saved.board.length > 0 || saved.deck.length > 0)) {
      setBoard(saved.board)
      setDeck(saved.deck)
      setStatus(saved.status)
      setRecentClaims(saved.recentClaims)
      setSetsFound(saved.setsFound ?? saved.recentClaims.length)
      // Resume from the persisted elapsed time rather than wall-clock time,
      // so time spent away from the page doesn't count against the player.
      setElapsedMs(saved.elapsedMs)
      setStartedAtMs(Date.now() - saved.elapsedMs)
      initializedRef.current = true
    } else {
      startNewGame()
    }

    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      if (rejectTimeoutRef.current) clearTimeout(rejectTimeoutRef.current)
    }
  }, [])

  // Persist on meaningful state changes
  useEffect(() => {
    persistNow()
  }, [board, deck, status, recentClaims, setsFound])

  // Persist when the page is hidden or being unloaded
  useEffect(() => {
    const onHide = () => persistNow()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') persistNow()
    }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return (
    <>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <GameLayout
        board={
          <Board
            cards={board}
            selectedCards={selectedCards}
            rejectedCards={rejectedCards}
            onCardClick={handleCardClick}
            claiming={false}
            gameOver={status === 'round_over'}
            paused={status === 'paused'}
          />
        }
        sidebar={
          <SolitaireSidebar
            elapsedMs={elapsedMs}
            deckCount={deck.length}
            setsFound={setsFound}
            status={status}
            onTogglePause={togglePause}
            onRestart={startNewGame}
            recentClaims={recentClaims}
          />
        }
      />
    </>
  )
}

export default SolitaireGame
