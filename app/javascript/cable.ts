import { createConsumer } from "@rails/actioncable"

// Get or create persistent player ID from localStorage
function getPlayerId(): string {
  const key = 'setgame_player_id'
  let playerId = localStorage.getItem(key)
  
  if (!playerId) {
    // Generate a new UUID
    playerId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
    localStorage.setItem(key, playerId)
  }
  
  return playerId
}

// Create consumer with player_id in query params
const playerId = getPlayerId()
// DEBUG: emit player id used by client
try {
  fetch('http://127.0.0.1:7242/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'debug-session',
      runId: 'prod-meta',
      hypothesisId: 'client-player-id',
      location: 'cable.ts:playerId',
      message: 'Client local playerId',
      data: { playerId },
      timestamp: Date.now()
    })
  }).catch(() => {})
} catch (_) {}
export const consumer = createConsumer(`/cable?player_id=${encodeURIComponent(playerId)}`)

// Expose consumer globally for debugging in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).debugConsumer = consumer
}

