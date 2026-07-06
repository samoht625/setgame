import { createConsumer } from "@rails/actioncable"

// Get or create persistent player ID from localStorage
export function getPlayerId(): string {
  const key = 'setgame_player_id'
  let playerId = localStorage.getItem(key)
  
  if (!playerId) {
    playerId = crypto.randomUUID()
    localStorage.setItem(key, playerId)
  }
  
  return playerId
}

const playerId = getPlayerId()
export const consumer = createConsumer(`/cable?player_id=${encodeURIComponent(playerId)}`)

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).debugConsumer = consumer
}
