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
  return (await saved(page)).ranked
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
    localStorage.setItem(key, JSON.stringify({ ranked: run }))
  }, { key: SAVE_KEY, claimMs, misses })
}

test('the daily is one shared deal: played once, clocked from first paint, then a result card', async ({ page, context }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const events = await recordEvents(page)
  await watchForCards(page)
  await page.addInitScript(() => localStorage.setItem('setgame_name', 'Daily Tester'))

  await page.goto('/daily')
  await expect(page).toHaveTitle('Set Daily Deal')
  await expect(page.getByRole('button', { name: 'Daily Deal', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Same deal for everyone today.')).toBeVisible()
  const label = await page.getByText(/^Daily Deal #\d+$/).first().innerText()
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
  await expect(page.locator('[aria-busy="true"]')).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText('—')
  await ready(page)
  const started = (await saved(page)).ranked
  const cardsShownAt = await page.evaluate(() => (window as unknown as { __cardsShownAt: number }).__cardsShownAt)
  expect(started.number).toBe(number)
  expect(started.startedAtMs).toBeGreaterThanOrEqual(requestedAt + 1500)
  expect(started.startedAtMs).toBeGreaterThanOrEqual(cardsShownAt)
  await expect.poll(() => named(events, 'game_start')).toEqual([{ mode: 'daily', ranked: true }])
  // A ranked daily can't be paused or restarted.
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Pause' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'New game' })).toHaveCount(0)
  await page.keyboard.press('Escape')
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

  // The game gives way to the result card on the page itself: no dialog to dismiss.
  const results = page.getByRole('region', { name: `Daily Deal #${number}` })
  await expect(results).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-card-id]')).toHaveCount(0)
  await expect(results.getByText(new RegExp(`^${body.daily.rank}(st|nd|rd|th) of ${body.daily.total}$`))).toBeVisible()
  await expect(results.getByText(/miss/i)).toHaveCount(0)
  await expect(results.getByText('1-day streak', { exact: true })).toBeVisible()
  await expect(results.locator('[aria-current="true"]')).toBeVisible()
  await expect(results.getByText(/^Next deal in /)).toBeVisible()
  await expect(results.getByRole('button', { name: /practice/i })).toHaveCount(0)

  await results.getByRole('button', { name: 'Share', exact: true }).click()
  await expect(results.getByText('Result copied — paste it anywhere')).toBeVisible()
  const shared = await page.evaluate(() => navigator.clipboard.readText())
  expect(shared).toMatch(new RegExp(`^Set Daily Deal #${number} · \\d+:\\d\\d\\n(?:[🟩🟨🟥]{1,9}\\n)+🏆 \\d+(?:st|nd|rd|th) of \\d+(?: · 🔥 \\d+ days)?\\nhttps://set\\.tido\\.site/daily\\?r=[\\w-]+$`, 'u'))
  // Nine squares to a row, one per set found.
  const rows = shared.split('\n').slice(1, -2)
  expect(rows.slice(0, -1).every(row => Array.from(row).length === 9)).toBe(true)
  expect(named(events, 'daily_share')).toEqual([{ outcome: 'copied' }])

  // The shared link previews this result: crawlers get a personalized title and image.
  const link = new URL(shared.split('\n').at(-1)!)
  const preview = await (await page.request.get(link.pathname + link.search, { headers: { 'User-Agent': 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' } })).text()
  const time = shared.match(/ · (\d+:\d\d)\n/)![1]
  expect(preview).toContain(`<meta property="og:title" content="Set Daily Deal #${number} · ${time}">`)
  const image = preview.match(/<meta property="og:image" content="https:\/\/set\.tido\.site(\/og\/daily\/[\w-]+\.png)">/)![1]
  const png = await page.request.get(image)
  expect(png.status()).toBe(200)
  expect(png.headers()['content-type']).toBe('image/png')

  // Coming back later shows the same card, not the game.
  await page.unroute('**/api/daily/games')
  await page.reload()
  await expect(results.getByText(new RegExp(`^${body.daily.rank}(st|nd|rd|th) of ${body.daily.total}$`))).toBeVisible()
  await expect(results.getByRole('button', { name: 'Share', exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-card-id]')).toHaveCount(0)

  // There is no second deal: the other way to keep playing is the solo game.
  await results.getByRole('link', { name: 'Puzzle', exact: true }).click()
  await expect(page).toHaveURL(/\/puzzle$/)
  await expect(page.getByRole('button', { name: 'Puzzle', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('a started daily survives reloads, and losing it doesn’t buy another try', async ({ page }) => {
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
  await expect(page.getByText(/^Daily Deal #\d+$/)).toBeVisible()

  // Losing the saved game doesn't buy another try, or a second deal of the same cards.
  await page.evaluate(key => localStorage.removeItem(key), SAVE_KEY)
  await page.reload()
  const card = page.getByRole('region', { name: /^Daily Deal #\d+$/ })
  await expect(card.getByText('You’ve used today’s try.')).toBeVisible()
  await expect(page.locator('[data-card-id]')).toHaveCount(0)
  await expect(card.getByRole('button', { name: 'Share' })).toHaveCount(0)
  await expect(card.getByRole('link', { name: 'Puzzle', exact: true })).toHaveAttribute('href', '/puzzle')
  const playerId = await page.evaluate(() => localStorage.getItem('setgame_player_id')!)
  const again = await page.request.post('/api/daily/games', { headers: { 'X-Player-Id': playerId } })
  expect(again.status()).toBe(409)
  expect(await again.json()).toMatchObject({ error: 'already_played' })
  expect(await again.json()).not.toHaveProperty('seed')
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
  const sizes: [number, number][] = [...widths.map((width): [number, number] => [width, 900]), [320, 480]]
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height })
    // The result's actions sit at the top of the card, on screen without scrolling.
    await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeInViewport({ ratio: 1 })
    await expect(page.getByRole('link', { name: 'Puzzle', exact: true })).toBeInViewport({ ratio: 1 })
    await noOverflow(page)
  }
})

test('the result card offers the Puzzle until it is done, then Practice, and notices a finish in another tab', async ({ page, context }) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => parts.find(p => p.type === type)!.value
  const date = `${part('year')}-${part('month')}-${part('day')}`
  const status = (result: object | null) => ({
    date, number: 7, next_at: new Date(Date.now() + 3600_000).toISOString(), total: 1, leaderboard: [],
    me: { attempted: Boolean(result), streak: 1, result }
  })
  const mine = { display_name: null, elapsed_ms: 132_000, misses: 2, rank: 1, total: 1, share_token: 'c-3gk0-abcdefghijkl', replay: true, streak: 1, marks: 'gggyyyrrrgy' }
  let puzzleFinished = false
  await page.route('**/api/daily', route => route.fulfill({ json: status(mine) }))
  await page.route('**/api/puzzle', route => route.fulfill({ json: status(puzzleFinished ? { ...mine, elapsed_ms: 40_000 } : null) }))
  await page.goto('/daily')
  await seedFinishedRun(page, [4, 8, 12, 20, 28, 36, 48, 60, 72, 92, 112, 132].map(s => s * 1000), 2)
  await page.reload()

  const results = page.getByRole('region', { name: 'Daily Deal #7' })
  await expect(results.getByRole('link', { name: 'Puzzle', exact: true })).toHaveAttribute('href', '/puzzle')

  // The Puzzle gets finished in another tab: its save lands in shared storage.
  puzzleFinished = true
  const other = await context.newPage()
  await other.goto('/stats')
  await other.evaluate(() => localStorage.setItem('setgame_puzzle_v1', JSON.stringify({ finishedElsewhere: Date.now() })))
  await expect(results.getByRole('link', { name: 'Practice', exact: true })).toHaveAttribute('href', '/practice')
  await expect(results.getByRole('link', { name: 'Puzzle', exact: true })).toHaveCount(0)
  await other.close()

  // A fresh load (e.g. another device) knows straight from the server.
  await page.reload()
  await expect(results.getByRole('link', { name: 'Practice', exact: true })).toBeVisible()

  // Switching games and back paints from what the page already knows: no loading card, no Puzzle flash, even on a slow network.
  await page.route('**/api/{daily,puzzle}', async route => { await new Promise(r => setTimeout(r, 2000)); await route.fallback() })
  const modes = page.getByRole('navigation', { name: 'Game mode' })
  await modes.getByRole('button', { name: 'Puzzle' }).click()
  await expect(page.getByRole('link', { name: 'Practice', exact: true })).toBeVisible({ timeout: 1000 })
  await modes.getByRole('button', { name: 'Daily Deal' }).click()
  await expect(results.getByRole('link', { name: 'Practice', exact: true })).toBeVisible({ timeout: 1000 })
  await expect(results.getByRole('link', { name: 'Puzzle', exact: true })).toHaveCount(0)
})

test('a signed-out finisher gets a one-time reminder prompt that floats over the card and comes back after a cooldown', async ({ page }) => {
  await page.goto('/daily')
  await seedFinishedRun(page, [4, 8, 12, 20, 28, 36, 48, 60, 72, 92, 112, 132].map(s => s * 1000), 2)
  await page.reload()
  const results = page.getByRole('region', { name: /Daily Deal #/ })
  await expect(results).toBeVisible()
  const before = await results.boundingBox()
  const prompt = page.getByRole('dialog', { name: 'Keep your streak going' })
  await expect(prompt).toBeVisible()
  await expect(prompt.getByText('if you haven’t played.')).toBeVisible()
  // No quiet link on the card any more, and the prompt doesn't move the card.
  await expect(page.getByRole('button', { name: 'Email me a daily reminder' })).toHaveCount(0)
  expect(await results.boundingBox()).toEqual(before)
  const field = prompt.getByLabel('Email')
  await expect(field).toHaveAttribute('data-1p-ignore', 'true')
  await expect(prompt.getByRole('button', { name: 'Remind me' })).toHaveCSS('cursor', 'pointer')

  await prompt.getByRole('button', { name: 'Not now' }).click()
  await expect(prompt).toHaveCount(0)
  await page.reload()
  await expect(results).toBeVisible()
  await page.waitForTimeout(1600)
  await expect(prompt).toHaveCount(0)

  // Three days after Not now (and on another day), it offers again; Remind me sends the link.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('setgame_reminder_prompt_v1')!).dismissals)).toBe(1)
  await page.evaluate(() => {
    const memory = JSON.parse(localStorage.getItem('setgame_reminder_prompt_v1') || '{}')
    localStorage.setItem('setgame_reminder_prompt_v1', JSON.stringify({ ...memory, shownOn: '2000-01-01', closedAt: Date.now() - 3 * 86400_000 - 1000 }))
  })
  let body: Record<string, unknown> | null = null
  await page.route('**/api/sign_in', route => { body = route.request().postDataJSON(); return route.fulfill({ json: { ok: true } }) })
  await page.reload()
  await expect(prompt).toBeVisible()
  await prompt.getByLabel('Email').fill('player@example.com')
  await prompt.getByRole('button', { name: 'Remind me' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Check your email' })).toBeVisible()
  expect(body).toMatchObject({ email: 'player@example.com', reminder_minutes: 480 })

  // A tap outside closes it too.
  await page.getByRole('heading', { name: /Daily Deal #/ }).click()
  await expect(page.getByText('Check your email')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('setgame_reminder_prompt_v1')!).dismissals)).toBe(1)

  // After the third Not now it stops offering for good.
  const later = () => page.evaluate(() => {
    const memory = JSON.parse(localStorage.getItem('setgame_reminder_prompt_v1') || '{}')
    localStorage.setItem('setgame_reminder_prompt_v1', JSON.stringify({ ...memory, shownOn: '2000-01-01', closedAt: Date.now() - 4 * 86400_000 }))
  })
  for (const turn of [2, 3]) {
    await later()
    await page.reload()
    await expect(prompt).toBeVisible()
    await prompt.getByRole('button', { name: 'Not now' }).click()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('setgame_reminder_prompt_v1')!).dismissals)).toBe(turn)
  }
  await later()
  await page.reload()
  await expect(results).toBeVisible()
  await page.waitForTimeout(1600)
  await expect(prompt).toHaveCount(0)
})

test('the reminder settings dialog is titled Daily reminder, like the sign-in form', async ({ page }) => {
  // Signed in as far as the page knows: the server's account meta tags, added to the page.
  await page.route('**/daily', async route => {
    const res = await route.fetch()
    const html = (await res.text()).replace('</head>', '<meta name="setgame-account" content="rose@example.com"><meta name="setgame-reminder" content="on:480"></head>')
    await route.fulfill({ response: res, body: html })
  })
  await page.goto('/daily')
  await page.getByRole('button', { name: 'Menu' }).first().click()
  await page.getByRole('menuitem', { name: /Reminder/ }).click()
  const dialog = page.getByRole('dialog', { name: /Daily reminder/ })
  await expect(dialog.getByRole('heading', { name: /Daily reminder/ })).toBeVisible()
  await expect(page.getByText('Reminder email')).toHaveCount(0)
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

    // A finished ranked run.
    await seedFinishedRun(page, [4, 8, 12, 20, 28, 36, 48, 60, 72, 92, 112, 132].map(s => s * 1000), 2)
    await page.reload()

    const results = page.getByRole('region', { name: 'Daily Deal #7' })
    await expect(results).toBeVisible()
    await expect(results.getByText('2:12', { exact: true })).toBeVisible()
    // The run counted two misses, but misses aren't part of the result.
    await expect(page.getByText(/miss/i)).toHaveCount(0)
    await expect(results.getByText(/[🟩🟨🟧🟥]/u)).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await noOverflow(page)
    const share = results.getByRole('button', { name: 'Share', exact: true })
    await expect(share).toBeInViewport({ ratio: 1 })
    await expect(results.getByRole('link', { name: 'Puzzle', exact: true })).toBeInViewport({ ratio: 1 })

    await share.click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared)).toEqual([
      { text: 'Set Daily Deal #7 · 2:12\nhttps://set.tido.site/daily' }
    ])
    await expect(page.getByText('Result copied — paste it anywhere')).toHaveCount(0)
  })

  test('Share hands the share sheet the result text with the signed link at its end, so Messages keeps the text and previews the link', async ({ page }) => {
    await page.addInitScript(() => {
      const shared: ShareData[] = []
      ;(window as unknown as { __shared: ShareData[] }).__shared = shared
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => { shared.push(data) } })
    })
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
    const part = (type: string) => parts.find(p => p.type === type)!.value
    const token = 'c-3gk0-abcdefghijkl'
    await page.route('**/api/daily', route => route.fulfill({
      json: {
        date: `${part('year')}-${part('month')}-${part('day')}`,
        number: 7,
        next_at: new Date(Date.now() + 3600_000).toISOString(),
        total: 1,
        leaderboard: [],
        me: { attempted: true, streak: 3, result: { display_name: null, elapsed_ms: 132_000, misses: 2, rank: 1, total: 1, share_token: token, replay: true, streak: 3, marks: 'gggyyyrrrgy' } }
      }
    }))
    await page.goto('/daily')
    await seedFinishedRun(page, [4, 8, 12, 20, 28, 36, 48, 60, 72, 92, 112, 132].map(s => s * 1000), 2)
    await page.reload()

    const results = page.getByRole('region', { name: 'Daily Deal #7' })
    await expect(results.getByText('1st of 1')).toBeVisible()
    await expect(results.getByRole('img', { name: 'Your pace on each set: 4 quick, 4 typical, 3 slow' }).locator('[data-mark]')).toHaveCount(11)
    await results.getByRole('button', { name: 'Share', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared)).toEqual([
      { text: `Set Daily Deal #7 · 2:12\n🟩🟩🟩🟨🟨🟨🟥🟥🟥\n🟩🟨\n🏆 1st of 1 · 🔥 3 days\nhttps://set.tido.site/daily?r=${token}` }
    ])
  })
})
