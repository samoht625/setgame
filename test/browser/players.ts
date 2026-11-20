import { request, type Page } from '@playwright/test'

type PlayerHeaders = { 'X-Player-Id': string; 'X-Player-Key': string }
type BootKind = 'daily' | 'puzzle'
type StatusTransform = (current: Record<string, unknown>) => Record<string, unknown>

const bootTransforms = new WeakMap<Page, Partial<Record<BootKind, StatusTransform>>>()

/**
 * Mocks today's status for `kind` in both the page's inlined `#setgame-boot`
 * JSON (which initial mount hydrates from without refetching) and `/api/:kind`.
 */
export async function routeBootStatus(page: Page, kind: BootKind, transform: StatusTransform): Promise<void> {
  let map = bootTransforms.get(page)
  if (!map) {
    map = {}
    bootTransforms.set(page, map)
    await page.route(url => ['/', '/puzzle', '/daily'].includes(url.pathname), async route => {
      if (route.request().resourceType() !== 'document') return route.fallback()
      const response = await route.fetch()
      const html = await response.text()
      const patched = html.replace(
        /(<script[^>]*id="setgame-boot"[^>]*>)([\s\S]*?)(<\/script>)/,
        (_, open: string, json: string, close: string) => {
          const boot = JSON.parse(json) as Record<string, unknown>
          const active = bootTransforms.get(page) ?? {}
          for (const k of ['daily', 'puzzle'] as const) {
            const fn = active[k]
            if (fn && boot[k] && typeof boot[k] === 'object') {
              boot[k] = fn(boot[k] as Record<string, unknown>)
            }
          }
          return `${open}${JSON.stringify(boot)}${close}`
        }
      )
      await route.fulfill({ response, body: patched })
    })
  }
  map[kind] = transform
  await page.route(`**/api/${kind}`, async route => {
    if (transform.length === 0) {
      await route.fulfill({ json: transform({}) })
      return
    }
    const response = await route.fetch()
    const current = (await response.json()) as Record<string, unknown>
    await route.fulfill({ response, json: transform(current) })
  })
}

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
