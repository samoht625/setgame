const STORAGE_KEY = 'setgame_player_id'
const KEY_PREFIX = 'setgame_player_key:'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Today's runs saved in this browser; see DailyGame and PuzzleGame.
const RUN_SAVES = ['setgame_daily_v1', 'setgame_puzzle_v1']

let cachedPlayerId: string | undefined
let createdThisVisit = false

/** True when this page load made up the player's id, i.e. this browser hasn't been here before. */
export function isNewPlayer(): boolean {
  getPlayerId()
  return createdThisVisit
}

function meta(name: string): string {
  if (typeof document === 'undefined') return ''
  return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? ''
}

/** The player the server's cookie (or the signed-in account) names, rendered into the page (see HomeController). */
export function knownPlayer(): { id: string; name: string | null } | null {
  const id = meta('setgame-player-id')
  if (!UUID.test(id)) return null
  return { id, name: meta('setgame-player-name') || null }
}

/** The signed-in account's email, or null when this browser plays anonymously. */
export function signedInEmail(): string | null {
  return meta('setgame-account') || null
}

/** Whether email sign-in is switched on for this site. */
export function signInEnabled(): boolean {
  return meta('setgame-sign-in') === '1'
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Gameplay can continue without persistence.
  }
}

/** Forgets today's finished runs kept in this browser, so the new player's own results show. */
function forgetFinishedRuns(all = false): void {
  for (const key of RUN_SAVES) {
    try {
      const save = JSON.parse(localStorage.getItem(key) || 'null')
      const run = save?.ranked ?? save
      if (all || run?.status === 'finished') localStorage.removeItem(key)
    } catch {
      // Nothing saved, or storage is unavailable.
    }
  }
}

/** Switches this browser to another player (signing in or out). */
export function switchPlayer(id: string, key: string | null, { forgetRuns = 'finished' }: { forgetRuns?: 'finished' | 'all' } = {}): void {
  if (!UUID.test(id)) return
  if (id !== read(STORAGE_KEY)) forgetFinishedRuns(forgetRuns === 'all')
  cachedPlayerId = id
  createdThisVisit = false
  write(STORAGE_KEY, id)
  if (key) write(KEY_PREFIX + id, key)
}

export function getPlayerId(): string {
  if (cachedPlayerId) return cachedPlayerId

  // A signed-in browser always plays as the account's player.
  const known = knownPlayer()
  if (signedInEmail() && known) {
    switchPlayer(known.id, meta('setgame-player-key') || null)
    return known.id
  }

  cachedPlayerId = read(STORAGE_KEY) || undefined

  // Storage was wiped (in-app browsers do this) but the cookie still knows who this is.
  if (!cachedPlayerId && known) {
    cachedPlayerId = known.id
    write(STORAGE_KEY, known.id)
  }

  if (!cachedPlayerId) {
    cachedPlayerId = crypto.randomUUID()
    createdThisVisit = true
    write(STORAGE_KEY, cachedPlayerId)
  }

  // The page's key is for the cookie's player; keep it when that's us.
  const pageKey = meta('setgame-player-key')
  if (pageKey && known?.id === cachedPlayerId) write(KEY_PREFIX + cachedPlayerId, pageKey)

  return cachedPlayerId
}

/** Proof that this browser owns its player id; player ids themselves are public. */
export function getPlayerKey(): string | null {
  return read(KEY_PREFIX + getPlayerId())
}

/**
 * The server says which player it used: an existing player over an id this
 * page just made up, the signed-in account's player, or a new player when
 * this browser couldn't prove it owns the id it sent. Adopt it, and its key,
 * so later requests and saved names match.
 */
export function adoptServerPlayer(serverId: string | null, serverKey: string | null): void {
  if (!serverId || !UUID.test(serverId)) return
  if (serverId !== getPlayerId()) {
    cachedPlayerId = serverId
    createdThisVisit = false
    write(STORAGE_KEY, serverId)
  }
  if (serverKey && /^[0-9a-f]{40}$/.test(serverKey)) write(KEY_PREFIX + serverId, serverKey)
}
