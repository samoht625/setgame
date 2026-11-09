import { test, expect, type Page } from '@playwright/test'

const SAVE_KEY = 'setgame_daily_v1'
const INSTALL_KEY = 'setgame_install_prompt_v1'
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

function today(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Saves a finished, submitted Daily Deal run for today. */
async function seedFinishedRun(page: Page, extra: Record<string, unknown> = {}) {
  await page.evaluate(({ key, date, extra }) => {
    const claimMs = [4, 8, 12, 20, 28, 36, 48, 60, 72, 92, 112, 132].map(s => s * 1000)
    localStorage.setItem(key, JSON.stringify({ ranked: {
      date, number: 7, gameId: 'seeded', seed: 1, board: [1, 2, 4], deck: [], rngState: 0, status: 'finished',
      startedAtMs: Date.now() - 200_000, elapsedMs: 132_000,
      events: claimMs.map(t_ms => ({ type: 'claim', cards: [1, 2, 3], t_ms })), misses: 0, submission: 'submitted', ...extra
    } }))
  }, { key: SAVE_KEY, date: today(), extra })
}

/** Stands in for the server verifying a signed ?r= token: the page's boot data gets the friend's result. */
async function sharedLink(page: Page, shared: object) {
  await page.route(/\/(daily|puzzle)\?r=/, async route => {
    const res = await route.fetch()
    const html = (await res.text()).replace('"shared":null', `"shared":${JSON.stringify(shared)}`)
    await route.fulfill({ response: res, body: html })
  })
}

test('a friend’s shared link asks to beat their time, and the result says who won', async ({ page, request }) => {
  const events = await recordEvents(page)
  const { number } = await (await request.get('/api/daily')).json()
  await sharedLink(page, { kind: 'daily', number, elapsed_ms: 599_000, rank: 2, total: 9 })
  await page.goto('/daily?r=friend')

  const challenge = page.locator('[data-challenge]')
  await expect(challenge).toContainText('Your friend’s time today')
  await expect(challenge).toContainText('9:59 · 2nd of 9')
  await expect(challenge).toContainText('Can you beat it?')
  await expect.poll(() => named(events, 'shared_landing')).toEqual([{ mode: 'daily' }])

  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  const run = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).ranked, SAVE_KEY)
  expect(run.rivalMs).toBe(599_000)

  // Finished in 2:12: the card says by how much.
  await seedFinishedRun(page, { number, gameId: run.gameId, rivalMs: 599_000 })
  await page.reload()
  await expect(page.locator('[data-rival]')).toHaveText('You beat your friend’s 9:59 by 7:47')
})

test('a link shared on an earlier day names that deal, and a deal already played shows no challenge', async ({ page, request }) => {
  const { number } = await (await request.get('/api/daily')).json()
  await sharedLink(page, { kind: 'daily', number: number - 1, elapsed_ms: 61_000 })
  await page.goto('/daily?r=friend')
  await expect(page.locator('[data-challenge]')).toContainText(`Your friend’s time on Daily Deal #${number - 1}`)

  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  const run = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).ranked, SAVE_KEY)
  expect(run.rivalMs, 'a different deal is no race').toBeUndefined()
})

test('the Puzzle’s shared link challenges too', async ({ page, request }) => {
  const { number } = await (await request.get('/api/puzzle')).json()
  await sharedLink(page, { kind: 'puzzle', number, elapsed_ms: 75_000 })
  await page.goto('/puzzle?r=friend')
  await expect(page.locator('[data-challenge]')).toContainText('1:15')
  await expect(page.locator('[data-challenge]')).toContainText('Can you beat it?')
})

test('the streak shows on the result card and in the menu, and the menu row goes to the Daily Deal', async ({ page }) => {
  const status = {
    date: today(), number: 7, next_at: new Date(Date.now() + 3600_000).toISOString(), total: 1, leaderboard: [],
    me: { attempted: true, streak: 3, result: { display_name: null, elapsed_ms: 132_000, misses: 0, rank: 1, total: 1, share_token: 'x', replay: false, streak: 3, marks: '' } }
  }
  await page.route('**/api/daily', route => route.fulfill({ json: status }))
  await page.goto('/daily')

  const streak = page.locator('[data-streak]')
  await expect(streak).toContainText('3-day streak')
  await expect(streak).toContainText('back tomorrow for 4')

  await page.getByRole('navigation', { name: 'Game mode' }).getByRole('button', { name: 'Puzzle' }).click()
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  const row = page.getByRole('menuitem', { name: /Streak/ })
  await expect(row).toContainText('🔥 3 days')
  await row.click()
  await expect(page).toHaveURL(/\/$/)
  await expect(streak).toBeVisible()
})

test('a new player’s first visit sends where it came from with their first game; a returning player sends nothing', async ({ page, context }) => {
  const started = page.waitForRequest(request => request.url().endsWith('/api/daily/games'))
  await page.goto('/?ref=dib2')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  const headers = (await started).headers()
  expect(headers['x-player-source']).toBe('ref:dib2')
  expect(headers['x-player-landing']).toBe('/')

  const returning = await context.newPage()
  await returning.addInitScript(() => {
    localStorage.removeItem('setgame_source_v1')
    localStorage.setItem('setgame_player_id', '11111111-2222-4333-8444-555555555555')
  })
  const puzzle = returning.waitForRequest(request => request.url().endsWith('/api/puzzle/games'))
  await returning.goto('/puzzle?ref=other')
  await returning.getByRole('button', { name: 'Start', exact: true }).click()
  expect((await puzzle).headers()['x-player-source']).toBeUndefined()
})

test.describe('Safari on an iPhone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
  })

  test('from the second day with a finish, the result offers Add to Home Screen instead of the email reminder', async ({ page }) => {
    const events = await recordEvents(page)
    const install = page.getByRole('dialog', { name: 'Add Set to your Home Screen' })
    const reminder = page.getByRole('dialog', { name: 'Keep your streak going' })
    await page.goto('/daily')

    // The first day with a finish: the reminder, as before.
    await seedFinishedRun(page)
    await page.reload()
    await expect(reminder).toBeVisible()
    await expect(install).toHaveCount(0)
    await reminder.getByRole('button', { name: 'Not now' }).click()

    // A later day with another finish: the home screen, with Safari's two taps.
    await page.evaluate(key => {
      const memory = JSON.parse(localStorage.getItem(key) || '{}')
      localStorage.setItem(key, JSON.stringify({ ...memory, days: ['2000-01-01', ...memory.days] }))
    }, INSTALL_KEY)
    await page.reload()
    await expect(install).toBeVisible()
    await expect(install.getByRole('listitem')).toHaveText([/Tap\s+Share in Safari$/, /Choose Add to Home Screen$/])
    await expect(reminder).toHaveCount(0)
    await expect(install.getByRole('button', { name: 'Got it' })).toBeInViewport({ ratio: 1 })
    expect(named(events, 'install_prompt')).toEqual([{ action: 'shown', kind: 'ios' }])

    // Not now: not again today, and a week off after that.
    await install.getByRole('button', { name: 'Not now' }).click()
    await expect(install).toHaveCount(0)
    const memory = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), INSTALL_KEY)
    expect(memory.dismissals).toBe(1)
    await page.reload()
    await page.waitForTimeout(1600)
    await expect(install).toHaveCount(0)

    // Past the cooldown it comes back; Got it ends it for good.
    await page.evaluate(key => {
      const memory = JSON.parse(localStorage.getItem(key)!)
      localStorage.setItem(key, JSON.stringify({ ...memory, shownOn: '2000-01-02', closedAt: Date.now() - 8 * 86400_000 }))
    }, INSTALL_KEY)
    await page.reload()
    await install.getByRole('button', { name: 'Got it' }).click()
    await page.evaluate(key => {
      const memory = JSON.parse(localStorage.getItem(key)!)
      localStorage.setItem(key, JSON.stringify({ ...memory, shownOn: '2000-01-03' }))
    }, INSTALL_KEY)
    await page.reload()
    await page.waitForTimeout(1600)
    await expect(install).toHaveCount(0)
    expect(named(events, 'install_prompt').map(data => data?.action)).toEqual(['shown', 'not_now', 'shown', 'ok'])
  })

  test('already on the home screen, it’s never offered, and the launch is counted', async ({ page }) => {
    const events = await recordEvents(page)
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { configurable: true, value: true }))
    await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ days: ['2000-01-01'] })), INSTALL_KEY)
    await page.goto('/daily')
    await seedFinishedRun(page)
    await page.reload()
    await page.waitForTimeout(1600)
    await expect(page.getByRole('dialog', { name: 'Add Set to your Home Screen' })).toHaveCount(0)
    expect(named(events, 'app_open')).toContainEqual({ display: 'standalone' })
  })
})
