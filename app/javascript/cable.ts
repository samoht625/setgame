import { createConsumer } from "@rails/actioncable"

import { getPlayerId } from './lib/player_id'
export { getPlayerId } from './lib/player_id'

const playerId = getPlayerId()
export const consumer = createConsumer(`/cable?player_id=${encodeURIComponent(playerId)}`)

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).debugConsumer = consumer
}
