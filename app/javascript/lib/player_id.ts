let cachedPlayerId: string | undefined
let createdThisVisit = false

/** True when this page load made up the player's id, i.e. this browser hasn't been here before. */
export function isNewPlayer(): boolean {
  getPlayerId()
  return createdThisVisit
}

export function getPlayerId(): string {
  if (cachedPlayerId) return cachedPlayerId

  try {
    cachedPlayerId = localStorage.getItem('setgame_player_id') || undefined
  } catch {
    // Keep one identity for this tab when browser storage is unavailable.
  }

  if (!cachedPlayerId) {
    cachedPlayerId = crypto.randomUUID()
    createdThisVisit = true
    try {
      localStorage.setItem('setgame_player_id', cachedPlayerId)
    } catch {
      // Gameplay can continue without persistence.
    }
  }

  return cachedPlayerId
}
