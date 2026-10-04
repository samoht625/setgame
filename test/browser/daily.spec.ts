import { test, expect, type Page } from '@playwright/test'
import { isSet } from '../../app/javascript/lib/rules'

const SAVE_KEY = 'setgame_daily_v1'
type Event = [string, Record<string, unknown> | undefined]

async function recordEvents(page: Page): Promise<Event[]> {
  const events: Event[] = []
  await page.exposeFunction('__recordUmami', (name: string, data?: Record<string, unknown>) => { events.push([name, data]) })
  await page.addInitScript(() => {
    const record = (window as unknown as { __recordUmami: (name: string, data?: unknown) => void }).__recordUmami
    window.umami = { track: (name, data) => record(name, data) }
  })
  return events
}

function named(events: Event[], name: string) {
  return events.filter(([event]) => event === name).map(([, data]) => data)
}

/** Records (as window.__cardsShownAt) when the first card is attached to the page. */
async function watchForCards(page: Page) {
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.querySelector('[data-card-id]')) return
      ;(window as unknown as { __cardsShownAt: number }).__cardsShownAt = Date.now()
      observer.disconnect()
    }).observe(document, { childList: true, subtree: true })
  })
}

async function cards(page: Page): Promise<number[]> {
  return page.locator('[data-card-id]').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-card-id'))))
}

function findTriple(board: number[], valid = true): number[] {
  for (let i = 0; i < board.length - 2; i++) {
    for (let j = i + 1; j < board.length - 1; j++) {
      for (let k = j + 1; k < board.length; k++) {
        const triple = [board[i], board[j], board[k]]
        if (isSet(...triple as [number, number, number]) === valid) return triple
      }
    }
  }
  throw new Error(`No ${valid ? 'valid' : 'invalid'} triple found`)
}

async function claim(page: Page, triple: number[]) {
  for (const id of triple) await page.locator(`[data-card-id="${id}"]`).click()
}

async function ready(page: Page) {
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
}

async function saved(page: Page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}'), SAVE_KEY)
}

async function currentRun(page: Page) {
  const save = await saved(page)
  return save.practice ?? save.ranked
}

async function playOut(page: Page, gapMs = 0) {
  for (let turn = 0; turn < 30; turn++) {
    if ((await currentRun(page))?.status === 'finished') return
    await claim(page, findTriple(await cards(page)))
    if (gapMs) await page.waitForTimeout(gapMs)
  }
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

/** Saves a finished, submitted ranked run for today with claims at the given times. */
async function seedFinishedRun(page: Page, claimMs: number[], misses: number) {
  await page.evaluate(({ key, claimMs, misses }) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
    const part = (type: string) => parts.find(p => p.type === type)!.value
    const run = {
      date: `${part('year')}-${part('month')}-${part('day')}`,
      number: 7,
      ranked: true,
      gameId: 'seeded',
      seed: 1,
      board: [1, 2, 4, 5, 10, 14, 20, 30, 40],
      deck: [],
      rngState: 0,
      status: 'finished',
      startedAtMs: Date.now() - 200_000,
      elapsedMs: claimMs[claimMs.length - 1],
      events: claimMs.map(t_ms => ({ type: 'claim', cards: [1, 2, 3], t_ms })),
      misses,
      submission: 'submitted'
    }
    localStorage.setItem(key, JSON.stringify({ ranked: run, practice: null }))
  }, { key: SAVE_KEY, claimMs, misses })
}

test('the daily is one shared deal: ranked once, clocked from first paint, shared, then practiced', async ({ page, context }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const events = await recordEvents(page)
  await watchForCards(page)
  await page.addInitScript(() => localStorage.setItem('setgame_name', 'Daily Tester'))

  await page.goto('/daily')
  await expect(page).toHaveTitle('Set Daily — Today’s deal, same for everyone')
  await expect(page.getByRole('button', { name: 'Daily', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Same deal for everyone today.')).toBeVisible()
  const label = await page.getByText(/^Set Daily #\d+$/).innerText()
  const number = Number(label.replace(/\D/g, ''))
  // Nothing is dealt, and no clock runs, until the player asks to start.
  await expect(page.locator('[data-card-id]')).toHaveCount(0)
  await expect(page.getByRole('timer')).toHaveText('—')

  let requestedAt = 0
  await page.route('**/api/daily/games', async route => {
    requestedAt = Date.now()
    await new Promise(resolve => setTimeout(resolve, 1500))
    await route.continue()
  })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.getByText('Dealing cards…')).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText('—')
  await ready(page)
  const started = (await saved(page)).ranked
  const cardsShownAt = await page.evaluate(() => (window as unknown as { __cardsShownAt: number }).__cardsShownAt)
  expect(started.ranked).toBe(true)
  expect(started.number).toBe(number)
  expect(started.startedAtMs).toBeGreaterThanOrEqual(requestedAt + 1500)
  expect(started.startedAtMs).toBeGreaterThanOrEqual(cardsShownAt)
  await expect.poll(() => named(events, 'game_start')).toEqual([{ mode: 'daily', ranked: true }])
  // A ranked daily can't be paused or restarted.
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'New game' })).toHaveCount(0)
  const rankedBoard = await cards(page)

  await claim(page, findTriple(rankedBoard, false))
  await expect(page.getByText('Not a valid set')).toBeVisible()
  expect((await saved(page)).ranked.misses).toBe(1)

  // The server refuses runs under 30 seconds.
  await page.waitForTimeout(30_500)
  const submission = page.waitForResponse(res => res.url().endsWith('/api/solo/scores'), { timeout: 60_000 })
  await playOut(page, 250)
  const response = await submission
  expect(response.status()).toBe(200)
  expect(response.request().postDataJSON()).toMatchObject({ misses: 1, display_name: 'Daily Tester' })
  const body = await response.json()
  expect(body.daily).toMatchObject({ number, rank: expect.any(Number), total: expect.any(Number), streak: 1 })
  expect(named(events, 'game_complete')).toEqual([{ mode: 'daily', seconds: expect.any(Number), misses: 1, sets: expect.any(Number), ranked: true }])

  // The result opens in the end-of-game dialog, not in the side panel.
  const results = page.getByRole('dialog', { name: `Set Daily #${number}` })
  await expect(results).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Leaderboard' })).toHaveCount(0)
  await expect(results.getByText(new RegExp(`^1 miss · ${body.daily.rank}(st|nd|rd|th) of ${body.daily.total}$`))).toBeVisible()
  await expect(results.getByText('1-day streak', { exact: true })).toBeVisible()
  await expect(results.locator('[aria-current="true"]')).toBeVisible()

  await results.getByRole('button', { name: 'Share', exact: true }).click()
  await expect(results.getByText('Result copied — paste it anywhere')).toBeVisible()
  const shared = await page.evaluate(() => navigator.clipboard.readText())
  expect(shared).toMatch(new RegExp(`^Set Daily #${number}\\n\\d+:\\d\\d · 1 miss\\n[🟩🟨🟧🟥]{8,9}\\nhttps://set\\.tido\\.site/daily$`, 'u'))
  expect(named(events, 'daily_share')).toEqual([{ outcome: 'copied' }])

  // Coming back later shows the result on the board, with the full results a tap away.
  await page.reload()
  await expect(page.getByText(new RegExp(`^1 miss · ${body.daily.rank}(st|nd|rd|th) of`))).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Results', exact: true }).click()
  await expect(results.getByRole('button', { name: 'Share', exact: true })).toBeVisible()

  // Practice replays the very same deal and never reaches the leaderboard.
  await page.unroute('**/api/daily/games')
  const scoreRequests: string[] = []
  page.on('request', request => { if (request.url().endsWith('/api/solo/scores')) scoreRequests.push(request.url()) })
  await results.getByRole('button', { name: 'Practice', exact: true }).click()
  await ready(page)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await cards(page)).toEqual(rankedBoard)
  await expect(page.getByText('Practice', { exact: true })).toBeVisible()
  await playOut(page)
  const practiceResults = page.getByRole('dialog', { name: `Practice · Daily #${number}` })
  await expect(practiceResults).toBeVisible()
  await expect(practiceResults.getByText('no misses · not ranked', { exact: true })).toBeVisible()
  expect(scoreRequests).toEqual([])
  expect(named(events, 'game_start')).toEqual([{ mode: 'daily', ranked: true }, { mode: 'daily', ranked: false }])

  await practiceResults.getByRole('button', { name: 'Your result', exact: true }).click()
  await expect(results.getByRole('button', { name: 'Share', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('a started ranked daily survives reloads, and after that the deal can only be practiced', async ({ page }) => {
  await page.goto('/daily')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await ready(page)
  const dealt = await cards(page)
  await claim(page, findTriple(dealt))
  await expect(page.getByText('1 set found', { exact: true })).toBeVisible()
  const afterClaim = await cards(page)

  await page.reload()
  await ready(page)
  expect(await cards(page)).toEqual(afterClaim)
  await expect(page.getByText('1 set found', { exact: true })).toBeVisible()
  await expect(page.getByText(/^Daily #\d+$/)).toBeVisible()

  // Losing the saved game doesn't buy another ranked try.
  await page.evaluate(key => localStorage.removeItem(key), SAVE_KEY)
  await page.reload()
  await expect(page.getByText('You’ve used today’s ranked try.')).toBeVisible()
  const playerId = await page.evaluate(() => localStorage.getItem('setgame_player_id')!)
  const again = await page.request.post('/api/daily/games', { headers: { 'X-Player-Id': playerId } })
  expect(await again.json()).toMatchObject({ ranked: false, game_id: null })

  await page.getByRole('button', { name: 'Practice this deal', exact: true }).click()
  await ready(page)
  expect(await cards(page)).toEqual(dealt)
  await expect(page.getByText('Practice', { exact: true })).toBeVisible()
  await expect(page.getByText('0 sets found', { exact: true })).toBeVisible()
})

test('the daily still plays when browser storage is unavailable', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError') }
  })
  await page.goto('/daily')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await ready(page)
  await claim(page, findTriple(await cards(page)))
  await expect(page.getByText('1 set found', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('the daily fits every width from intro to result', async ({ page }) => {
  const widths = [320, 375, 768, 1440]
  await page.goto('/daily')
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeInViewport()
    await noOverflow(page)
  }

  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await ready(page)
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    const timer = await page.getByRole('timer').boundingBox()
    const card = await page.locator('[data-card-id]').first().boundingBox()
    expect(timer!.y + timer!.height).toBeLessThanOrEqual(card!.y)
    await noOverflow(page)
  }

  await seedFinishedRun(page, [5, 11, 18, 26, 33, 41, 50, 58, 66].map(s => s * 1000), 0)
  await page.reload()
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByRole('button', { name: 'Results', exact: true })).toBeInViewport()
    await noOverflow(page)
  }

  await page.getByRole('button', { name: 'Results', exact: true }).click()
  const sizes: [number, number][] = [...widths.map((width): [number, number] => [width, 900]), [320, 480]]
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height })
    // The dialog scrolls inside itself; its buttons stay on screen.
    await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeInViewport({ ratio: 1 })
    await noOverflow(page)
  }
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the result fits the screen and Share opens the share sheet', async ({ page }) => {
    await page.addInitScript(() => {
      const shared: ShareData[] = []
      ;(window as unknown as { __shared: ShareData[] }).__shared = shared
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => { shared.push(data) } })
    })
    await page.goto('/daily')
    await expect(page.getByText('Same deal for everyone today.')).toBeVisible()
    await noOverflow(page)

    // A finished ranked run: three sets per square at 4s, 8s, 12s and 20s a set.
    await seedFinishedRun(page, [4, 8, 12, 20, 28, 36, 48, 60, 72, 92, 112, 132].map(s => s * 1000), 2)
    await page.reload()

    await expect(page.getByText('Set Daily #7', { exact: true })).toBeVisible()
    await expect(page.getByRole('timer')).toHaveText('2:12')
    await expect(page.getByText('2 misses', { exact: true })).toBeVisible()
    await noOverflow(page)
    // The board's result card grows the board instead of spilling over the page footer.
    const openResults = page.getByRole('button', { name: 'Results', exact: true })
    const cardBottom = await openResults.evaluate(node => node.closest('.rounded-2xl')!.getBoundingClientRect().bottom)
    const footerTop = await page.locator('footer').evaluate(node => node.getBoundingClientRect().top)
    expect(cardBottom).toBeLessThanOrEqual(footerTop)

    await openResults.click()
    const results = page.getByRole('dialog', { name: 'Set Daily #7' })
    await expect(results.getByRole('img', { name: /Pace/ })).toHaveText('🟩🟨🟧🟥')
    const share = results.getByRole('button', { name: 'Share', exact: true })
    await expect(share).toBeInViewport({ ratio: 1 })
    await noOverflow(page)

    await share.click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared)).toEqual([
      { text: 'Set Daily #7\n2:12 · 2 misses\n🟩🟨🟧🟥\nhttps://set.tido.site/daily' }
    ])
    await expect(page.getByText('Result copied — paste it anywhere')).toHaveCount(0)
  })
})
