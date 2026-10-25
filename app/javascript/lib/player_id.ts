const STORAGE_KEY = 'setgame_player_id'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

let cachedPlayerId: string | undefined
let createdThisVisit = false

/** True when this page load made up the player's id, i.e. this browser hasn't been here before. */
export function isNewPlayer(): boolean {
  getPlayerId()
  return createdThisVisit
}

/** The player the server's cookie names, rendered into the page (see HomeController). */
export function knownPlayer(): { id: string; name: string | null } | null {
  if (typeof document === 'undefined') return null
  const id = document.querySelector<HTMLMetaElement>('meta[name="setgame-player-id"]')?.content ?? ''
  if (!UUID.test(id)) return null
  const name = document.querySelector<HTMLMetaElement>('meta[name="setgame-player-name"]')?.content || null
  return { id, name }
}

function remember(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Gameplay can continue without persistence.
  }
}

export function getPlayerId(): string {
  if (cachedPlayerId) return cachedPlayerId

  try {
    cachedPlayerId = localStorage.getItem(STORAGE_KEY) || undefined
  } catch {
    // Keep one identity for this tab when browser storage is unavailable.
  }

  // Storage was wiped (in-app browsers do this) but the cookie still knows who this is.
  if (!cachedPlayerId) {
    const known = knownPlayer()
    if (known) {
      cachedPlayerId = known.id
      remember(known.id)
    }
  }

  if (!cachedPlayerId) {
    cachedPlayerId = crypto.randomUUID()
    createdThisVisit = true
    remember(cachedPlayerId)
  }

  return cachedPlayerId
}

/**
 * The server keeps an existing player over an id this page just made up, and
 * says which one it used. Adopt it so later requests and saved names match.
 */
export function adoptServerPlayerId(serverId: string | null): void {
  if (!serverId || !UUID.test(serverId) || !createdThisVisit || serverId === cachedPlayerId) return
  cachedPlayerId = serverId
  createdThisVisit = false
  remember(serverId)
}
