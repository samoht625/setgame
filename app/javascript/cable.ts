import { createConsumer, type Consumer } from '@rails/actioncable'
import { getPlayerId, isNewPlayer } from './lib/player_id'

let consumer: Consumer | null = null

/**
 * WebSocket URL for Action Cable. Relies on the same-origin signed HttpOnly
 * cookies (`setgame_session`, `player_id`) for authentication instead of
 * sending the permanent player key in the URL query string.
 */
export function cableUrl(): string {
  const playerId = getPlayerId()
  return `/cable?player_id=${encodeURIComponent(playerId)}${isNewPlayer() ? '&new=1' : ''}`
}

/**
 * Lazily constructs the Action Cable consumer only when Multiplayer actually
 * connects, avoiding WebSocket setup on non-multiplayer pages. Passing
 * `cableUrl` as a function ensures reconnects pick up the latest player id.
 */
export function getConsumer(): Consumer {
  if (!consumer) {
    consumer = createConsumer(cableUrl)
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      ;(window as Window & { debugConsumer?: Consumer }).debugConsumer = consumer
    }
  }
  return consumer
}
