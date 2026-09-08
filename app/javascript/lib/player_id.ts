let cachedPlayerId: string | undefined

export function getPlayerId(): string {
  if (cachedPlayerId) return cachedPlayerId

  try {
    cachedPlayerId = localStorage.getItem('setgame_player_id') || undefined
  } catch {
    // Keep one identity for this tab when browser storage is unavailable.
  }

  if (!cachedPlayerId) {
    cachedPlayerId = crypto.randomUUID()
    try {
      localStorage.setItem('setgame_player_id', cachedPlayerId)
    } catch {
      // Gameplay can continue without persistence.
    }
  }

  return cachedPlayerId
}
