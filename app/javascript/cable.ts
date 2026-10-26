import { createConsumer } from "@rails/actioncable"

import { getPlayerId, getPlayerKey, isNewPlayer } from './lib/player_id'
export { getPlayerId } from './lib/player_id'

const playerId = getPlayerId()
const playerKey = getPlayerKey()
export const consumer = createConsumer(
  `/cable?player_id=${encodeURIComponent(playerId)}${playerKey ? `&key=${encodeURIComponent(playerKey)}` : ''}${isNewPlayer() ? '&new=1' : ''}`
)

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).debugConsumer = consumer
}
