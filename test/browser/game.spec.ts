import { test, expect, type Page } from '@playwright/test'
import { isSet } from '../../app/javascript/lib/rules'

const SAVE_KEY = 'setgame_solo_state_v2'

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
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY)
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test('solo claims, pause, resume, full completion, reload and mode history stay consistent', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await ready(page)
  const initial = await cards(page)
  const first = page.locator('[data-card-id]').first()
  await first.focus()
  await page.keyboard.press('Space')
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Space')
  await expect(first).toHaveAttribute('aria-pressed', 'false')
  await claim(page, findTriple(initial, false))
  await expect(page.getByRole('status')).toContainText('Not a valid set')
  expect(await cards(page)).toEqual(initial)

  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Resume game' })).toBeVisible()
  await expect(first).toBeDisabled()
  const pausedTime = await page.getByRole('timer').innerText()
  await page.clock.install()
  await page.clock.runFor(3000)
  await expect(page.getByRole('timer')).toHaveText(pausedTime)
  await page.getByRole('button', { name: 'Resume game' }).click()
  await ready(page)

  for (let count = 1; count <= 10; count++) {
    await claim(page, findTriple(await cards(page)))
    await expect(page.getByText(`${count} ${count === 1 ? 'set' : 'sets'} found`, { exact: true })).toBeVisible()
  }
  const boardAfterTen = await cards(page)
  await page.getByRole('button', { name: 'Multiplayer', exact: true }).click()
  await expect(page).toHaveURL(/\/m$/)
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  await page.goBack()
  await ready(page)
  expect(await cards(page)).toEqual(boardAfterTen)
  await expect(page.getByText('10 sets found', { exact: true })).toBeVisible()
  await page.reload()
  await ready(page)
  await expect(page.getByText('10 sets found', { exact: true })).toBeVisible()

  for (let turn = 0; turn < 20; turn++) {
    if ((await saved(page)).status === 'round_over') break
    await claim(page, findTriple(await cards(page)))
  }
  await expect(page.getByText('Finished', { exact: true })).toBeVisible()
  const finished = await saved(page)
  expect(finished.events.length).toBeGreaterThan(20)
  await page.reload()
  await expect(page.getByText('Finished', { exact: true })).toBeVisible()
  await expect(page.getByText(`${finished.events.length} sets found`, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Play again' }).click()
  await ready(page)
  await expect(page.getByText('0 sets found', { exact: true })).toBeVisible()
  await page.goto('/s')
  await expect(page).toHaveURL(/\/$/)
  await ready(page)
  expect(errors).toEqual([])
})

test('an eligible solo game submits a real replay and appears on the leaderboard', async ({ page }) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => localStorage.setItem('setgame_name', 'Solo Browser Tester'))
  await page.goto('/')
  await ready(page)
  const response = page.waitForResponse(res => res.url().endsWith('/api/solo/scores'), { timeout: 80000 })
  for (let turn = 0; turn < 30; turn++) {
    if ((await saved(page)).status === 'round_over') break
    // Real elapsed time must satisfy the server's minimum claim interval.
    await page.waitForTimeout(1600)
    await claim(page, findTriple(await cards(page)))
  }
  expect((await response).status()).toBe(200)
  await expect(page.getByText('Finished', { exact: true })).toBeVisible()
  await expect(page.getByText('Your best', { exact: true })).toBeVisible()
  await expect(page.getByText('Solo Browser Tester', { exact: true }).first()).toBeVisible()
  expect((await saved(page)).submissionStatus).toBe('submitted')
})

test('leaderboard requests are single, cancellable, and distinguish failure from empty data', async ({ page }) => {
  const requests: string[] = []
  let fail = false
  await page.route('**/api/solo/leaderboard?*', async route => {
    const period = new URL(route.request().url()).searchParams.get('period')!
    requests.push(period)
    if (period === 'weekly') await new Promise(resolve => setTimeout(resolve, 250))
    await route.fulfill({ status: fail ? 503 : 200, json: fail ? {} : { entries: [{ player_id: 'test', display_name: `${period} leader`, elapsed_ms: 120000, completed_at: '2026-09-07T12:00:00Z' }] } })
  })
  await page.goto('/')
  await ready(page)
  // Nothing is fetched until the leaderboard panel is opened.
  expect(requests).toEqual([])
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click()
  await expect(page.getByText('daily leader', { exact: true })).toBeVisible()
  expect(requests).toEqual(['daily'])
  await page.getByRole('button', { name: 'weekly', exact: true }).click()
  await page.getByRole('button', { name: 'monthly', exact: true }).click()
  await expect(page.getByText('monthly leader', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'monthly', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('weekly leader', { exact: true })).toHaveCount(0)
  fail = true
  await page.getByRole('button', { name: 'daily', exact: true }).click()
  await expect(page.getByText('Could not load times.', { exact: true })).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('daily leader', { exact: true })).toBeVisible()
  // Closing hides the panel; the choice is remembered across reloads on desktop.
  await page.getByRole('button', { name: 'Close leaderboard' }).click()
  await expect(page.getByText('daily leader', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click()
  await page.reload()
  await expect(page.getByText('daily leader', { exact: true })).toBeVisible()
})

test('the leaderboard opens as a sheet on phones and stays closed on reload', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await ready(page)
  const toggle = page.getByRole('button', { name: 'Leaderboard', exact: true })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  const sheet = page.getByRole('dialog', { name: 'Leaderboard' })
  await expect(sheet).toBeVisible()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await noOverflow(page)
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await toggle.click()
  await expect(sheet).toBeVisible()
  await page.reload()
  await ready(page)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('a delayed abandoned new game cannot overwrite a more recent solo game', async ({ page }) => {
  let requests = 0
  let release!: () => void
  const delayed = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/solo/games', async route => {
    requests++
    const number = requests
    if (number === 1) await delayed
    await route.fulfill({ json: { game_id: `game-${number}`, seed: 123 + number, rules_version: 1 } })
  })
  await page.goto('/')
  await expect(page.getByText('Dealing cards…', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New game', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Multiplayer', exact: true }).click()
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Solo', exact: true }).click()
  await ready(page)
  expect((await saved(page)).gameId).toBe('game-2')
  release()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  expect((await saved(page)).gameId).toBe('game-2')
  expect(requests).toBe(2)
})

test('offline play and unavailable browser storage do not crash either mode', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError') }
  })
  await page.route('**/api/solo/games', route => route.abort())
  await page.goto('/')
  await ready(page)
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible()
  await claim(page, findTriple(await cards(page)))
  await expect(page.getByText('1 set found', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Multiplayer', exact: true }).click()
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  await ready(page)
  await page.getByRole('button', { name: 'Solo', exact: true }).click()
  await ready(page)
  expect(errors).toEqual([])
})

test('a paused save keeps its idle deadline and corrupted local times are ignored', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key)!)
    state.savedAtMs = Date.now() - 14 * 60 * 1000
    localStorage.setItem(key, JSON.stringify(state))
    localStorage.setItem('setgame_solo_best_times', JSON.stringify([{ ms: 100, at: 'invalid date' }, null]))
  }, SAVE_KEY)
  const previous = await saved(page)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Resume game' })).toBeVisible()
  expect((await saved(page)).savedAtMs).toBe(previous.savedAtMs)
  await page.clock.install()
  await page.clock.fastForward(2 * 60 * 1000)
  await page.getByRole('button', { name: 'Resume game' }).click()
  await ready(page)
  expect((await saved(page)).gameId).not.toBe(previous.gameId)
})

test('failed score submissions survive reload and recover from a lost acknowledgement', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key)!)
    Object.assign(state, { board: [1, 2, 3], deck: [], events: [], recentClaims: [], elapsedMs: 31000, startedAtMs: Date.now() - 31000 })
    localStorage.setItem(key, JSON.stringify(state))
  }, SAVE_KEY)
  await page.reload()
  await ready(page)
  let attempts = 0
  await page.route('**/api/solo/scores', async route => {
    attempts++
    await route.fulfill({ status: attempts === 1 ? 503 : 422, json: { error: attempts === 1 ? 'unavailable' : 'already_completed' } })
  })
  await claim(page, [1, 2, 3])
  await expect(page.getByRole('button', { name: 'Retry submission' })).toBeVisible()
  expect((await saved(page)).submissionStatus).toBe('pending')
  await page.reload()
  await expect(page.getByText('Finished', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Retry submission' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Submitted!' })).toBeVisible()
  expect((await saved(page)).submissionStatus).toBe('submitted')
  expect(attempts).toBe(2)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('setgame_solo_best_times')!).length)).toBe(1)
})

test('expanded and empty boards retain usable layouts and reload safely', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  for (const size of [15, 18]) {
    await page.evaluate(({ key, size }) => {
      const state = JSON.parse(localStorage.getItem(key)!)
      state.board = Array.from({ length: size }, (_, index) => index + 1)
      state.deck = Array.from({ length: 81 - size }, (_, index) => size + index + 1)
      localStorage.setItem(key, JSON.stringify(state))
    }, { key: SAVE_KEY, size })
    await page.reload()
    await expect(page.locator('[data-card-id]')).toHaveCount(size)
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 900 })
      await noOverflow(page)
      await page.getByRole('button', { name: 'Pause', exact: true }).click()
      await expect(page.locator('[data-card-id]').first()).toBeDisabled()
      await page.getByRole('button', { name: 'Resume game' }).click()
    }
  }
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key)!)
    Object.assign(state, { board: [], deck: [], status: 'round_over' })
    localStorage.setItem(key, JSON.stringify(state))
  }, SAVE_KEY)
  await page.reload()
  await expect(page.getByText('Finished', { exact: true })).toBeVisible()
  await expect(page.getByText('Round over', { exact: true })).toBeVisible()
  await noOverflow(page)
  await page.getByRole('button', { name: 'Play again' }).click()
  await ready(page)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`desktop and mobile layouts support ${colorScheme} mode and reduced motion`, async ({ page }) => {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await page.goto('/')
    await ready(page)
    for (const width of [1440, 1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await noOverflow(page)
      const first = page.locator('[data-card-id]').first()
      expect(await first.evaluate(node => getComputedStyle(node).animationName)).toBe('none')
      await page.getByRole('button', { name: 'Pause', exact: true }).click()
      await noOverflow(page)
      await page.screenshot({ path: `tmp/after-${colorScheme}-${width}-solo.png`, fullPage: true })
      await page.getByRole('button', { name: 'Resume game' }).click()
      await page.getByRole('button', { name: 'Multiplayer', exact: true }).click()
      await expect(page.getByText('Live', { exact: true })).toBeVisible()
      await ready(page)
      await noOverflow(page)
      await page.screenshot({ path: `tmp/after-${colorScheme}-${width}-multiplayer.png`, fullPage: true })
      await page.getByRole('button', { name: 'Solo', exact: true }).click()
      await ready(page)
    }
  })
}

test('multiplayer synchronizes claims, names, reset cancellation, and reconnection', async ({ browser }) => {
  const firstContext = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  const secondContext = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  try {
    const first = await firstContext.newPage()
    const second = await secondContext.newPage()
    await first.goto('/m')
    await second.goto('/m')
    await expect(first.getByText('Live', { exact: true })).toBeVisible()
    await expect(second.getByText('Live', { exact: true })).toBeVisible()
    await ready(first)
    await ready(second)
    const board = await cards(first)
    expect(await cards(second)).toEqual(board)
    await first.getByTitle('Click to edit your name').click()
    await first.getByRole('textbox', { name: 'Your name' }).fill('Browser Tester')
    await first.getByRole('textbox', { name: 'Your name' }).press('Enter')
    await expect(first.getByTitle('Click to edit your name')).toHaveText('Browser Tester')
    await second.getByRole('button', { name: 'Players', exact: true }).click()
    const players = second.getByRole('complementary', { name: 'Players' })
    await expect(players.getByText('Browser Tester', { exact: true }).first()).toBeVisible()
    const triple = findTriple(board)
    await claim(first, triple)
    await expect(first.getByRole('status')).toContainText('You found a set!')
    await expect(second.getByRole('status')).toContainText('Browser Tester found a set!')
    await expect(second.locator('[data-card-id]').first()).toBeDisabled()
    await expect(first.locator(`[data-card-id="${triple[0]}"]`)).toHaveCount(0)
    await ready(second)
    expect(await cards(second)).toEqual(await cards(first))
    const recent = players.getByRole('list').filter({ has: second.getByRole('img') })
    await expect(recent.getByRole('listitem').first()).toContainText('Browser Tester')
    await expect(recent.getByRole('listitem').first().getByRole('img')).toHaveCount(3)
    await first.getByRole('button', { name: 'Reset game', exact: true }).click()
    await second.getByRole('button', { name: /Stop reset with/ }).click()
    await expect(first.getByRole('button', { name: 'Reset game', exact: true })).toBeVisible()
    await firstContext.setOffline(true)
    await expect(first.getByText('Reconnecting…', { exact: true })).toBeVisible()
    await expect(first.locator('[data-card-id]').first()).toBeDisabled()
    await firstContext.setOffline(false)
    await expect(first.getByText('Live', { exact: true })).toBeVisible({ timeout: 20000 })
    await ready(first)
    expect(await cards(first)).toEqual(await cards(second))
    await first.getByRole('button', { name: 'Solo', exact: true }).click()
    await expect(first.getByRole('button', { name: /Multiplayer/ })).toHaveAttribute('title', /playing multiplayer/)
    await first.getByRole('button', { name: /Multiplayer/ }).click()
    await expect(first.getByText('Live', { exact: true })).toBeVisible()
  } finally {
    await firstContext.close()
    await secondContext.close()
  }
})
