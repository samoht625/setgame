import { test, expect, type Page, type Request, type WebSocket } from '@playwright/test'
import { withTimeout } from '../../app/javascript/lib/abort'
import { isSet } from '../../app/javascript/lib/rules'
import { playAsNewPlayer, routeBootStatus } from './players'

function today(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date())
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

test.describe('withTimeout unit tests (P4)', () => {
  test('aborts with TimeoutError after ms and works when AbortSignal.any is undefined', async () => {
    const originalAny = (AbortSignal as unknown as { any?: unknown }).any
    try {
      ;(AbortSignal as unknown as { any?: unknown }).any = undefined
      expect((AbortSignal as unknown as { any?: unknown }).any).toBeUndefined()

      const { signal, cleanup } = withTimeout(40)
      expect(signal.aborted).toBe(false)
      await new Promise(resolve => setTimeout(resolve, 90))
      expect(signal.aborted).toBe(true)
      expect((signal.reason as Error)?.name).toBe('TimeoutError')
      cleanup()
    } finally {
      ;(AbortSignal as unknown as { any?: unknown }).any = originalAny
    }
  })

  test('propagates parent abort immediately with reason and cancels timer', async () => {
    const parent = new AbortController()
    const reason = new Error('cancelled by caller')
    const { signal, cleanup } = withTimeout(5_000, parent.signal)
    expect(signal.aborted).toBe(false)
    parent.abort(reason)
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe(reason)
    cleanup()
  })

  test('handles an already-aborted parent signal synchronously', () => {
    const parent = new AbortController()
    const reason = new Error('already aborted')
    parent.abort(reason)
    const { signal, cleanup } = withTimeout(5_000, parent.signal)
    expect(signal.aborted).toBe(true)
    expect(signal.reason).toBe(reason)
    cleanup()
  })

  test('cleanup prevents timeout abort, removes parent listener, and is idempotent', async () => {
    const parent = new AbortController()
    let added = 0
    let removed = 0
    const origAdd = parent.signal.addEventListener.bind(parent.signal)
    const origRemove = parent.signal.removeEventListener.bind(parent.signal)
    parent.signal.addEventListener = (...args: Parameters<typeof origAdd>) => {
      added++
      return origAdd(...args)
    }
    parent.signal.removeEventListener = (...args: Parameters<typeof origRemove>) => {
      removed++
      return origRemove(...args)
    }

    const { signal, cleanup } = withTimeout(40, parent.signal)
    expect(added).toBe(1)
    cleanup()
    cleanup()
    expect(removed).toBe(1)
    await new Promise(resolve => setTimeout(resolve, 90))
    expect(signal.aborted).toBe(false)
    parent.abort(new Error('late parent abort'))
    expect(signal.aborted).toBe(false)
  })
})

test.describe('Safari 16.4–17.3 / Chrome 111–115 compatibility without AbortSignal.any (P4)', () => {
  test('core routes and leaderboards work with zero errors when AbortSignal.any is missing', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true, writable: true })
    })

    // Puzzle (including opening Leaderboard panel, which triggers /api/puzzle)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Leaderboard', exact: true }).click()
    await expect(page.getByRole('complementary', { name: 'Leaderboard' })).toBeVisible()

    // Daily Deal
    await page.goto('/daily')
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()

    // Practice (startSoloGame + useSoloScores leaderboard + personal bests)
    await page.goto('/practice')
    await expect(page.locator('[data-card-id]').first()).toBeEnabled()
    await expect(page.getByRole('complementary', { name: 'Leaderboard' })).toBeVisible()

    // Archive list & archived day
    await page.goto('/archive')
    await expect(page.locator('a[data-archive-tile]').first()).toBeVisible()
    await page.goto('/puzzle/1')
    await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toBeVisible()

    expect(errors).toEqual([])
  })
})

test.describe('Mount-time boot hydration dedup (P1)', () => {
  function trackRequests(page: Page, paths: string[]) {
    const seen: string[] = []
    page.on('request', (req: Request) => {
      const { pathname } = new URL(req.url())
      if (paths.includes(pathname)) seen.push(pathname)
    })
    return seen
  }

  test('/ and /daily make zero redundant /api/puzzle, /api/daily, or /presence requests on initial mount', async ({ page }) => {
    await playAsNewPlayer(page)
    const watched = ['/api/puzzle', '/api/daily', '/presence']

    // Desktop with leaderboard panel already open from a prior visit should STILL not double-fetch on mount.
    await page.addInitScript(() => localStorage.setItem('setgame_panel_open', '1'))

    for (const routePath of ['/', '/daily']) {
      const seen = trackRequests(page, watched)
      await page.goto(routePath)
      await expect(page.locator('[data-game-card="start"]')).toBeVisible()
      await page.waitForTimeout(500)
      expect(seen, `initial mount of ${routePath} should not refetch hydrated boot data`).toEqual([])
    }
  })

  test('finished result card on /daily skips initial /api/daily, /api/puzzle, and /presence, but refreshes on visibilitychange', async ({ page }) => {
    await playAsNewPlayer(page)
    const date = today()
    const mine = {
      display_name: null,
      elapsed_ms: 120_000,
      misses: 0,
      rank: 1,
      total: 1,
      share_token: 'tok',
      replay: false,
      streak: 1,
      marks: 'ggg'
    }
    await routeBootStatus(page, 'daily', () => ({
      date,
      number: 7,
      next_at: new Date(Date.now() + 3_600_000).toISOString(),
      total: 1,
      leaderboard: [],
      me: { attempted: true, streak: 1, result: mine }
    }))
    await routeBootStatus(page, 'puzzle', () => ({
      date,
      number: 7,
      next_at: new Date(Date.now() + 3_600_000).toISOString(),
      total: 0,
      leaderboard: [],
      me: { attempted: false, streak: 0, result: null }
    }))

    const seen = trackRequests(page, ['/api/daily', '/api/puzzle', '/presence'])
    await page.goto('/daily')
    const results = page.getByRole('region', { name: 'Daily Deal #7' })
    await expect(results).toBeVisible()
    await expect(results.getByRole('link', { name: 'Puzzle', exact: true })).toBeVisible()
    await page.waitForTimeout(500)
    expect(seen).toEqual([])

    // Returning to the tab (visibilitychange -> visible) refreshes presence and other-daily status.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect.poll(() => seen.includes('/presence')).toBe(true)
    await expect.poll(() => seen.includes('/api/puzzle')).toBe(true)
  })

  test('opening the Leaderboard panel on / triggers a fresh /api/puzzle request', async ({ page }) => {
    await playAsNewPlayer(page)
    const seen = trackRequests(page, ['/api/puzzle', '/api/daily', '/presence'])
    await page.goto('/')
    await expect(page.locator('[data-game-card="start"]')).toBeVisible()
    await page.waitForTimeout(300)
    expect(seen).toEqual([])

    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Leaderboard', exact: true }).click()
    await expect.poll(() => seen).toEqual(['/api/puzzle'])
  })

  test('falls back to fetching when boot JSON is absent or data-online-ids is absent', async ({ page }) => {
    await playAsNewPlayer(page)
    await page.route(url => url.pathname === '/', async route => {
      if (route.request().resourceType() !== 'document') return route.fallback()
      const res = await route.fetch()
      const html = (await res.text())
        .replace(/<script[^>]*id="setgame-boot"[^>]*>[\s\S]*?<\/script>/, '')
        .replace(/\sdata-online-ids="[^"]*"/, '')
      await route.fulfill({ response: res, body: html })
    })
    const seen = trackRequests(page, ['/api/puzzle', '/presence'])
    await page.goto('/')
    await expect(page.locator('[data-game-card="start"]')).toBeVisible()
    await expect.poll(() => seen.includes('/api/puzzle')).toBe(true)
    await expect.poll(() => seen.includes('/presence')).toBe(true)
  })
})

test.describe('Lazy Action Cable & no key= in WebSocket URL (P5 & S2)', () => {
  test('non-multiplayer routes never open /cable, and /m connects without key= in query params', async ({ page }) => {
    await playAsNewPlayer(page)
    const sockets: string[] = []
    page.on('websocket', (ws: WebSocket) => sockets.push(ws.url()))

    for (const path of ['/', '/daily', '/practice', '/archive', '/stats']) {
      await page.goto(path)
      await page.waitForTimeout(400)
      expect(sockets, `route ${path} must not open Action Cable`).toEqual([])
    }

    // Now navigate to Multiplayer: Action Cable connects lazily and omits key= from the URL.
    await page.goto('/m')
    await expect(page.locator('[data-card-id]').first()).toBeEnabled()
    expect(sockets.length).toBeGreaterThanOrEqual(1)
    for (const wsUrl of sockets) {
      const parsed = new URL(wsUrl)
      expect(parsed.pathname).toBe('/cable')
      expect(parsed.searchParams.has('key')).toBe(false)
      expect(parsed.searchParams.get('player_id')).toBeTruthy()
    }
  })
})

test.describe('Countdown leaf, Board memoization & Practice idle persistence (P7)', () => {
  test('NextDealCountdown ticks on its own without disrupting the board or result card', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-20T18:00:00Z') })
    await playAsNewPlayer(page)
    const date = '2026-11-20'
    const nextAt = new Date('2026-11-20T20:05:00Z').toISOString()
    await routeBootStatus(page, 'daily', () => ({
      date,
      number: 7,
      next_at: nextAt,
      total: 1,
      leaderboard: [],
      me: {
        attempted: true,
        streak: 1,
        result: { display_name: null, elapsed_ms: 90_000, misses: 0, rank: 1, total: 1, share_token: 'tok', replay: false, streak: 1, marks: 'ggg' }
      }
    }))
    await page.goto('/daily')
    const results = page.getByRole('region', { name: 'Daily Deal #7' })
    await expect(results.getByText('Next deal in 2h 5m')).toBeVisible()

    // Advance 65 seconds so the 30s NextDealCountdown leaf ticks cleanly.
    await page.clock.runFor(65_000)
    await expect(results.getByText('Next deal in 2h 4m')).toBeVisible()
  })

  test('Practice does not poll localStorage while idle, and persists on claim and visibilitychange/pagehide', async ({ page }) => {
    await playAsNewPlayer(page)
    await page.addInitScript(() => {
      const writes: number[] = []
      ;(window as unknown as { __soloWrites: number[] }).__soloWrites = writes
      const origSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === 'setgame_solo_state_v2') writes.push(Date.now())
        return origSetItem.call(this, key, value)
      }
    })

    await page.goto('/practice')
    await expect(page.locator('[data-card-id]').first()).toBeEnabled()
    // Let initial paint + save settle.
    await page.waitForTimeout(300)
    const writesAfterStart = await page.evaluate(() => (window as unknown as { __soloWrites: number[] }).__soloWrites.length)

    // Remain idle for 12s (previously triggered ACTIVITY_SAVE_INTERVAL_MS = 10s write via 1s interval).
    await page.waitForTimeout(12_000)
    const writesAfterIdle = await page.evaluate(() => (window as unknown as { __soloWrites: number[] }).__soloWrites.length)
    expect(writesAfterIdle).toBe(writesAfterStart)

    // Claiming a valid set persists state immediately.
    const board = await page.locator('[data-card-id]').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('data-card-id'))))
    let setTriple: number[] | null = null
    for (let i = 0; i < board.length && !setTriple; i++) {
      for (let j = i + 1; j < board.length && !setTriple; j++) {
        for (let k = j + 1; k < board.length && !setTriple; k++) {
          if (isSet(board[i]!, board[j]!, board[k]!)) setTriple = [board[i]!, board[j]!, board[k]!]
        }
      }
    }
    for (const id of setTriple!) await page.locator(`[data-card-id="${id}"]`).click()
    await expect(page.getByText('1 set found', { exact: true })).toBeVisible()
    const writesAfterClaim = await page.evaluate(() => (window as unknown as { __soloWrites: number[] }).__soloWrites.length)
    expect(writesAfterClaim).toBeGreaterThan(writesAfterIdle)

    // Hiding the tab with no new interaction since the last save does not rewrite storage.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(await page.evaluate(() => (window as unknown as { __soloWrites: number[] }).__soloWrites.length)).toBe(writesAfterClaim)

    // Tapping a card records unsaved activity, which visibilitychange (hidden) then persists once.
    const nextBoard = await page.locator('[data-card-id]').evaluateAll(nodes => nodes.map(n => Number(n.getAttribute('data-card-id'))))
    await page.locator(`[data-card-id="${nextBoard[0]}"]`).click()
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    const writesAfterHide = await page.evaluate(() => (window as unknown as { __soloWrites: number[] }).__soloWrites.length)
    expect(writesAfterHide).toBe(writesAfterClaim + 1)

    // Another card tap followed by pagehide persists once.
    await page.locator(`[data-card-id="${nextBoard[0]}"]`).click()
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
    const writesAfterPageHide = await page.evaluate(() => (window as unknown as { __soloWrites: number[] }).__soloWrites.length)
    expect(writesAfterPageHide).toBe(writesAfterHide + 1)
  })
})
