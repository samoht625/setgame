import { request, type Page } from '@playwright/test'

type PlayerHeaders = { 'X-Player-Id': string; 'X-Player-Key': string }

/**
 * Has the server mint a player for `page`'s browser (the cookie lands in its
 * context) and keeps it in storage from the first load on. The server only
 * plays as an id with its cookie or key, so specs can't make ids up.
 */
export async function playAsNewPlayer(page: Page): Promise<string> {
  const res = await page.request.get('/api/daily')
  const id = res.headers()['x-player-id']!
  const key = res.headers()['x-player-key']!
  await page.addInitScript(([id, key]) => {
    localStorage.setItem('setgame_player_id', id!)
    localStorage.setItem(`setgame_player_key:${id}`, key!)
  }, [id, key])
  return id
}

/** `count` separate players, each minted in its own cookie jar, as the headers that prove them. */
export async function mintPlayers(baseURL: string, count: number): Promise<PlayerHeaders[]> {
  return Promise.all(Array.from({ length: count }, async () => {
    const api = await request.newContext({ baseURL })
    try {
      const res = await api.get('/api/daily')
      return { 'X-Player-Id': res.headers()['x-player-id']!, 'X-Player-Key': res.headers()['x-player-key']! }
    } finally {
      await api.dispose()
    }
  }))
}
