import { test, expect, type Locator, type Page } from '@playwright/test'
import { isSet } from '../../app/javascript/lib/rules'

/** Picks an action from the header's overflow menu. */
async function menu(page: Page, name: string) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}

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

/** Leaves the current game one (unranked) set from the end. */
async function oneSetLeft(page: Page) {
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key)!)
    Object.assign(state, { board: [1, 2, 3], deck: [], events: [], recentClaims: [], status: 'playing', elapsedMs: 31000, startedAtMs: Date.now() - 31000, eligible: false })
    localStorage.setItem(key, JSON.stringify(state))
  }, SAVE_KEY)
  await page.reload()
  await ready(page)
}

test('solo claims, pause, resume, full completion, reload and mode history stay consistent', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/practice')
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

  await menu(page, 'Pause')
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
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: /^Multiplayer/ }).click()
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
  await page.goto('/solo')
  await expect(page).toHaveURL(/\/practice$/)
  await ready(page)
  expect(errors).toEqual([])
})

test('an eligible solo game submits a real replay and appears on the leaderboard', async ({ page }) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => localStorage.setItem('setgame_name', 'Solo Browser Tester'))
  await page.goto('/practice')
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
  await expect(page.getByRole('dialog', { name: 'Round over' })).toBeVisible()
  await expect(page.getByText('Your best', { exact: true })).toBeVisible()
  await expect(page.getByText('Solo Browser Tester', { exact: true }).first()).toBeVisible()
  expect((await saved(page)).submissionStatus).toBe('submitted')
  // The finish-time peek at the leaderboard is not saved as a preference.
  expect(await page.evaluate(() => localStorage.getItem('setgame_panel_open'))).toBeNull()
  await page.reload()
  await expect(page.getByText('Finished', { exact: true })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Leaderboard' })).toHaveCount(0)
})

test('a finished game shows its results in a dialog that closes by button, Escape, backdrop or a new game', async ({ page }) => {
  await page.goto('/practice')
  await ready(page)
  await oneSetLeft(page)
  await claim(page, [1, 2, 3])
  const results = page.getByRole('dialog', { name: 'Round over' })
  await expect(results).toBeVisible()
  await expect(results.getByRole('button', { name: 'Close', exact: true })).toBeFocused()
  await expect(page.getByRole('complementary', { name: 'Leaderboard' })).toHaveCount(0)

  const viewport = page.viewportSize()!
  const dismissals = [
    () => results.getByRole('button', { name: 'Close', exact: true }).click(),
    () => page.keyboard.press('Escape'),
    () => page.mouse.click(12, viewport.height - 12)
  ]
  for (const dismiss of dismissals) {
    await dismiss()
    await expect(results).toBeHidden()
    // The board keeps a small card to play again or bring the results back.
    await expect(page.getByText('Cleared the deck', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Results', exact: true }).click()
    await expect(results).toBeVisible()
  }

  await results.getByText('Cleared the deck', { exact: true }).click()
  await expect(results).toBeVisible()

  await results.getByRole('button', { name: 'Play again', exact: true }).click()
  await ready(page)
  await expect(page.getByText('0 sets found', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Leaderboard' })).toHaveCount(0)
})

test('the results dialog leaves a leaderboard panel the player opened alone', async ({ page }) => {
  await page.goto('/practice')
  await ready(page)
  await menu(page, 'Leaderboard')
  const panel = page.getByRole('complementary', { name: 'Leaderboard' })
  await expect(panel).toBeVisible()
  await oneSetLeft(page)
  await claim(page, [1, 2, 3])
  const results = page.getByRole('dialog', { name: 'Round over' })
  await expect(results).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(results).toBeHidden()
  await expect(panel).toBeVisible()
  await page.getByRole('button', { name: 'Play again', exact: true }).click()
  await ready(page)
  await expect(panel).toBeVisible()
})

test('the results dialog fits a phone screen and closes with a tap outside', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/practice')
  await ready(page)
  await oneSetLeft(page)
  await claim(page, [1, 2, 3])
  const results = page.getByRole('dialog', { name: 'Round over' })
  for (const size of [{ width: 375, height: 667 }, { width: 320, height: 480 }]) {
    await page.setViewportSize(size)
    await expect(results.getByRole('button', { name: 'Play again', exact: true })).toBeInViewport({ ratio: 1 })
    await expect(results.getByRole('button', { name: 'Close', exact: true })).toBeInViewport({ ratio: 1 })
    await noOverflow(page)
  }
  await page.mouse.click(4, 476)
  await expect(results).toBeHidden()
  await expect(page.getByRole('button', { name: 'Play again', exact: true })).toBeInViewport()
})

test('New game is a visible button on the solo board row, and the header and board row stay on one line on phones', async ({ page }) => {
  await page.goto('/practice')
  await ready(page)
  const before = (await saved(page)).gameId
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 700 })
    const newGame = page.getByRole('button', { name: 'New game', exact: true })
    await expect(newGame).toBeInViewport({ ratio: 1 })
    const timer = await page.getByRole('timer', { name: 'Elapsed time' }).boundingBox()
    const button = await newGame.boundingBox()
    // Same row as the timer and stats.
    expect(Math.abs((button!.y + button!.height / 2) - (timer!.y + timer!.height / 2))).toBeLessThan(8)
    const header = await page.locator('header').first().boundingBox()
    expect(header!.height).toBeLessThanOrEqual(64)
    await noOverflow(page)
  }
  await page.screenshot({ path: 'tmp/newgame-mobile.png', clip: { x: 0, y: 0, width: 375, height: 260 } })
  await page.getByRole('button', { name: 'New game', exact: true }).click()
  await expect.poll(async () => (await saved(page)).gameId).not.toBe(before)
  await ready(page)
  // Still in the menu too.
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'New game', exact: true })).toBeEnabled()
})

test('the header menu opens in its final place on the first frame on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 })
  await page.goto('/practice')
  await ready(page)
  // Record the menu's box the moment it's inserted and on the next painted frame.
  await page.evaluate(() => {
    const w = window as unknown as { __menuBoxes: DOMRect[] }
    w.__menuBoxes = []
    new MutationObserver((_, observer) => {
      const menu = document.querySelector('[role="menu"]')
      if (!menu) return
      observer.disconnect()
      w.__menuBoxes.push(menu.getBoundingClientRect())
      requestAnimationFrame(() => {
        w.__menuBoxes.push(menu.getBoundingClientRect())
        requestAnimationFrame(() => w.__menuBoxes.push(menu.getBoundingClientRect()))
      })
    }).observe(document.body, { childList: true, subtree: true })
  })
  const button = page.getByRole('button', { name: 'Menu', exact: true })
  await button.click()
  const menu = page.getByRole('menu', { name: 'Menu' })
  await expect(menu).toBeVisible()
  await page.waitForTimeout(400) // well past any open animation
  const final = await menu.evaluate(node => node.getBoundingClientRect().toJSON())
  const early = await page.evaluate(() => (window as unknown as { __menuBoxes: DOMRect[] }).__menuBoxes.map(box => box.toJSON()))
  expect(early).toHaveLength(3)
  for (const box of early) {
    expect(Math.abs(box.x - final.x)).toBeLessThan(0.5)
    expect(Math.abs(box.y - final.y)).toBeLessThan(0.5)
  }
  // Final place: under the button, right edges lined up, fully on screen.
  const anchorBox = (await button.boundingBox())!
  expect(Math.abs(final.right - (anchorBox.x + anchorBox.width))).toBeLessThan(1)
  expect(final.top).toBeGreaterThanOrEqual(anchorBox.y + anchorBox.height - 1)
  expect(final.left).toBeGreaterThanOrEqual(0)
  expect(final.right).toBeLessThanOrEqual(375)
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
  await page.goto('/practice')
  await ready(page)
  // Nothing is fetched until the leaderboard panel is opened.
  expect(requests).toEqual([])
  await menu(page, 'Leaderboard')
  await expect(page.getByText('daily leader', { exact: true })).toBeVisible()
  // Opening fetches the selected period first and the others once each, ready for their tabs.
  await expect.poll(() => requests).toEqual(['daily', 'weekly', 'monthly'])
  await page.getByRole('button', { name: 'weekly', exact: true }).click()
  await page.getByRole('button', { name: 'monthly', exact: true }).click()
  await expect(page.getByText('monthly leader', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'monthly', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('weekly leader', { exact: true })).toHaveCount(0)
  expect(requests).toEqual(['daily', 'weekly', 'monthly'])
  fail = true
  await page.reload()
  await expect(page.getByText('Could not load times.', { exact: true })).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('daily leader', { exact: true })).toBeVisible()
  // Closing hides the panel; the choice is remembered across reloads on desktop.
  await page.getByRole('button', { name: 'Close leaderboard' }).click()
  await expect(page.getByText('daily leader', { exact: true })).toHaveCount(0)
  await menu(page, 'Leaderboard')
  await page.reload()
  await expect(page.getByText('daily leader', { exact: true })).toBeVisible()
})

test('the leaderboard opens as a sheet on phones and stays closed on reload', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/practice')
  await ready(page)
  const sheet = page.getByRole('dialog', { name: 'Leaderboard' })
  await expect(sheet).toHaveCount(0)
  await menu(page, 'Leaderboard')
  await expect(sheet).toBeVisible()
  await noOverflow(page)
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await menu(page, 'Leaderboard')
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
  await page.goto('/practice')
  await expect(page.locator('[aria-busy="true"]')).toBeVisible()
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'New game', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: /^Multiplayer/ }).click()
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Practice' }).click()
  await ready(page)
  expect((await saved(page)).gameId).toBe('game-2')
  release()
  await menu(page, 'Pause')
  expect((await saved(page)).gameId).toBe('game-2')
  expect(requests).toBe(2)
})

test('a new solo game starts its clock once its cards are on screen, not when they were requested', async ({ page }) => {
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.querySelector('[data-card-id]')) return
      ;(window as unknown as { __cardsShownAt: number }).__cardsShownAt = Date.now()
      observer.disconnect()
    }).observe(document, { childList: true, subtree: true })
  })
  let requestedAt = 0
  await page.route('**/api/solo/games', async route => {
    requestedAt = Date.now()
    await new Promise(resolve => setTimeout(resolve, 1500))
    await route.continue()
  })
  await page.goto('/practice')
  await expect(page.locator('[aria-busy="true"]')).toBeVisible()
  await ready(page)
  const { startedAtMs } = await saved(page)
  const cardsShownAt = await page.evaluate(() => (window as unknown as { __cardsShownAt: number }).__cardsShownAt)
  expect(startedAtMs).toBeGreaterThanOrEqual(requestedAt + 1500)
  expect(startedAtMs).toBeGreaterThanOrEqual(cardsShownAt)
  await expect(page.getByRole('timer')).toHaveText(/^0:0[0-2]$/)
})

test('offline play and unavailable browser storage do not crash either mode', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError') }
  })
  await page.route('**/api/solo/games', route => route.abort())
  await page.goto('/practice')
  await ready(page)
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible()
  await claim(page, findTriple(await cards(page)))
  await expect(page.getByText('1 set found', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: /^Multiplayer/ }).click()
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  await ready(page)
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Practice' }).click()
  await ready(page)
  expect(errors).toEqual([])
})

test('a paused save keeps its idle deadline and corrupted local times are ignored', async ({ page }) => {
  await page.goto('/practice')
  await ready(page)
  await menu(page, 'Pause')
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
  await page.goto('/practice')
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
  await page.goto('/practice')
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
      await menu(page, 'Pause')
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
    await page.goto('/practice')
    await ready(page)
    for (const width of [1440, 1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 })
      await noOverflow(page)
      const first = page.locator('[data-card-id]').first()
      expect(await first.evaluate(node => getComputedStyle(node).animationName)).toBe('none')
      await menu(page, 'Pause')
      await noOverflow(page)
      await page.screenshot({ path: `tmp/after-${colorScheme}-${width}-solo.png`, fullPage: true })
      await page.getByRole('button', { name: 'Resume game' }).click()
      await page.getByRole('button', { name: 'Menu' }).click()
      await page.getByRole('menuitem', { name: /^Multiplayer/ }).click()
      await expect(page.getByText('Live', { exact: true })).toBeVisible()
      await ready(page)
      await noOverflow(page)
      await page.screenshot({ path: `tmp/after-${colorScheme}-${width}-multiplayer.png`, fullPage: true })
      await page.getByRole('button', { name: 'Menu' }).click()
      await page.getByRole('menuitem', { name: 'Practice' }).click()
      await ready(page)
    }
  })
}

/** What one card's outline is made of: its border, its ring, its focus outline, its face, and where the artwork sits. */
async function cardOutline(page: Page, card: number | Locator) {
  const locator = typeof card === 'number' ? page.locator(`[data-card-id="${card}"]`) : card
  return locator.evaluate(node => {
    const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const rgb = (color: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
    }
    const luminance = (color: string) => {
      const [r, g, b] = rgb(color).map(value => {
        const channel = value / 255
        return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    const contrast = (a: string, b: string) => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (light! + 0.05) / (dark! + 0.05)
    }
    const style = getComputedStyle(node)
    const face = node.querySelector('svg')!
    // A ring is the box shadow with a spread and no blur or offset.
    const ring = [...style.boxShadow.matchAll(/((?:rgba?|oklch|oklab|color)\([^)]+\)) 0px 0px 0px (\d+(?:\.\d+)?)px(?! inset)/g)]
      .map(match => ({ color: match[1]!, width: Number(match[2]) }))
      .find(shadow => shadow.width > 0)
    const outlined = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
    const faceColor = getComputedStyle(face).backgroundColor
    const page = getComputedStyle(document.body).backgroundColor
    const box = face.getBoundingClientRect()
    return {
      borderWidth: parseFloat(style.borderTopWidth),
      borderColor: rgb(style.borderTopColor),
      ringWidth: ring?.width ?? 0,
      ringColor: ring ? rgb(ring.color) : null,
      ringVsPage: ring ? contrast(ring.color, page) : 0,
      ringVsFace: ring ? contrast(ring.color, faceColor) : 0,
      outlineWidth: outlined ? parseFloat(style.outlineWidth) : 0,
      outlineOffset: outlined ? parseFloat(style.outlineOffset) : 0,
      outlineColor: outlined ? rgb(style.outlineColor) : null,
      outlineVsPage: outlined ? contrast(style.outlineColor, page) : 0,
      outlineVsFace: outlined ? contrast(style.outlineColor, faceColor) : 0,
      faceColor: rgb(faceColor),
      pageColor: rgb(page),
      face: [box.x, box.y, box.width, box.height].map(value => Math.round(value * 100) / 100)
    }
  })
}

/**
 * The colours met walking from the page into a card across its left edge, as
 * drawn: one entry per band, so a clean ring reads page, ring, face. A lone
 * pixel between two bands is an edge's anti-aliasing (or the hairline border
 * of a card with no ring) and is left out.
 */
async function edgeBands(page: Page, card: number | Locator): Promise<number[][]> {
  const locator = typeof card === 'number' ? page.locator(`[data-card-id="${card}"]`) : card
  const box = (await locator.boundingBox())!
  // From inside the gap beside the card (8px at its narrowest) to the blank part of the face.
  const strip = await page.screenshot({ clip: { x: box.x - 7, y: Math.round(box.y + box.height / 2), width: 15, height: 1 } })
  const pixels = await page.evaluate(async source => {
    const image = new Image()
    image.src = source
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = 1
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const data = context.getImageData(0, 0, canvas.width, 1).data
    return Array.from({ length: canvas.width }, (_, x) => [data[x * 4]!, data[x * 4 + 1]!, data[x * 4 + 2]!])
  }, `data:image/png;base64,${strip.toString('base64')}`)
  const near = (a: number[], b: number[]) => a.every((value, channel) => Math.abs(value - b[channel]!) <= 6)
  const runs: { color: number[]; length: number }[] = []
  for (const pixel of pixels) {
    const last = runs[runs.length - 1]
    if (last && near(last.color, pixel)) last.length += 1
    else runs.push({ color: pixel, length: 1 })
  }
  const bands: number[][] = []
  for (const run of runs.filter(run => run.length > 1)) {
    if (!bands.length || !near(bands[bands.length - 1]!, run.color)) bands.push(run.color)
  }
  return bands
}

/** Whether two colours are the same to the eye, give or take a rounding step. */
function sameColor(a: number[] | null, b: number[] | null): boolean {
  return !!a && !!b && a.every((value, channel) => Math.abs(value - b[channel]!) <= 6)
}

async function expectBands(page: Page, card: number | Locator, expected: (number[] | null)[], message: string) {
  await expect.poll(async () => {
    const bands = await edgeBands(page, card)
    return bands.length === expected.length && bands.every((band, index) => sameColor(band, expected[index]!))
      ? 'as expected'
      : JSON.stringify(bands)
  }, { message: `${message}: wanted ${JSON.stringify(expected)}` }).toBe('as expected')
}

test('dark mode draws one ring hugging the light card face: no band inside it, no halo outside it', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/practice')
    await ready(page)
    const board = await cards(page)
    const wrong = findTriple(board, false)
    const other = board.find(id => !wrong.includes(id))!
    const card = (id: number) => page.locator(`[data-card-id="${id}"]`)
    const idle = await cardOutline(page, wrong[0]!)
    expect([idle.ringWidth, idle.borderWidth, idle.outlineWidth]).toEqual([0, 1, 0])
    await expectBands(page, wrong[0]!, [idle.pageColor, idle.faceColor], 'a card with no ring')

    // Selected: the border and the ring are one colour, as heavy as the light theme's, straight onto the face.
    await card(wrong[0]!).click()
    await expect(card(wrong[0]!)).toHaveAttribute('aria-pressed', 'true')
    await page.mouse.move(0, 0)
    const selected = await cardOutline(page, wrong[0]!)
    expect([selected.borderWidth, selected.ringWidth], 'the light theme’s weights').toEqual([1, 2])
    expect(sameColor(selected.borderColor, selected.ringColor), 'no band of another colour between the ring and the face').toBe(true)
    expect(selected.ringVsPage).toBeGreaterThanOrEqual(3)
    expect(selected.outlineWidth, 'a click alone draws no focus outline').toBe(0)
    expect(selected.face, 'the artwork stays put').toEqual(idle.face)
    await expectBands(page, wrong[0]!, [selected.pageColor, selected.ringColor, selected.faceColor], 'a selected card')

    // Hovering it changes nothing.
    await card(wrong[0]!).hover()
    const hovered = await cardOutline(page, wrong[0]!)
    expect([hovered.borderWidth, hovered.ringWidth, hovered.outlineWidth]).toEqual([1, 2, 0])
    expect(sameColor(hovered.borderColor, selected.ringColor)).toBe(true)
    await expectBands(page, wrong[0]!, [selected.pageColor, selected.ringColor, selected.faceColor], 'a selected card under the pointer')
    await page.mouse.move(0, 0)

    // A key pressed with the clicked card still focused brings the focus outline: the same ring, heavier, not a second one.
    await page.keyboard.press('Shift')
    await expect.poll(async () => (await cardOutline(page, wrong[0]!)).outlineWidth).toBeGreaterThan(0)
    const focused = await cardOutline(page, wrong[0]!)
    expect(focused.outlineOffset, 'the focus outline starts at the card, over the ring').toBe(0)
    expect(focused.outlineWidth, 'and is heavier than the ring, so focus still shows').toBeGreaterThan(focused.ringWidth)
    expect(sameColor(focused.outlineColor, focused.ringColor), 'in the ring’s own colour').toBe(true)
    expect(sameColor(focused.borderColor, focused.ringColor)).toBe(true)
    await expectBands(page, wrong[0]!, [selected.pageColor, selected.ringColor, selected.faceColor], 'a selected card with keyboard focus')

    // Keyboard focus on a card with no ring is one ring too, in a colour that reads against the face and the page.
    await card(other).focus()
    await expect.poll(async () => (await cardOutline(page, other)).outlineWidth).toBeGreaterThan(0)
    const focusOnly = await cardOutline(page, other)
    expect(focusOnly.ringWidth).toBe(0)
    expect(focusOnly.outlineOffset).toBe(0)
    expect(sameColor(focusOnly.borderColor, focusOnly.outlineColor), 'the border joins the outline').toBe(true)
    expect(focusOnly.outlineVsFace).toBeGreaterThanOrEqual(3)
    expect(focusOnly.outlineVsPage).toBeGreaterThanOrEqual(3)
    expect(sameColor(focusOnly.outlineColor, selected.ringColor), 'and is not the selection’s colour').toBe(false)
    await expectBands(page, other, [focusOnly.pageColor, focusOnly.outlineColor, focusOnly.faceColor], 'a focused card with no ring')
    await card(other).blur()

    // A wrong pick gets the same treatment in its own colour.
    await card(wrong[1]!).click()
    await card(wrong[2]!).click()
    await expect(page.locator('.animate-shake')).toHaveCount(3)
    const rejected = await cardOutline(page, wrong[1]!)
    expect([rejected.borderWidth, rejected.ringWidth]).toEqual([1, 2])
    expect(sameColor(rejected.borderColor, rejected.ringColor)).toBe(true)
    expect(sameColor(rejected.ringColor, selected.ringColor)).toBe(false)
    expect(rejected.ringVsPage).toBeGreaterThanOrEqual(3)
    await expect(page.locator('.animate-shake')).toHaveCount(0)
    const after = await cardOutline(page, wrong[1]!)
    expect([after.ringWidth, after.borderWidth], 'and the card is as it was once the ring goes').toEqual([0, 1])
  }

  // The How to play example lights its set the same way.
  await menu(page, 'How to play')
  const lit = page.locator('[data-in-set="true"]').first()
  await expect(lit).toBeVisible({ timeout: 15_000 })
  const example = await cardOutline(page, lit)
  expect([example.borderWidth, example.ringWidth]).toEqual([1, 2])
  expect(sameColor(example.borderColor, example.ringColor)).toBe(true)
  const corners = await lit.evaluate(card => getComputedStyle(card).backgroundColor === getComputedStyle(card.querySelector('svg')!).backgroundColor)
  expect(corners, 'the card behind the face is the face’s colour, so nothing darker shows inside the ring at the corners').toBe(true)
  await page.keyboard.press('Escape')

  // The light theme is as it was: a dark ring straight onto the white face, and the page's own focus outline.
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto('/practice')
  await ready(page)
  const [first] = await cards(page)
  await page.locator(`[data-card-id="${first}"]`).click()
  const light = await cardOutline(page, first!)
  expect(light.borderWidth).toBe(1)
  expect(light.ringWidth).toBe(2)
  expect(sameColor(light.borderColor, light.ringColor)).toBe(true)
  expect(light.ringVsFace).toBeGreaterThanOrEqual(3)
  await page.keyboard.press('Shift')
  await expect.poll(async () => (await cardOutline(page, first!)).outlineWidth).toBe(2)
  expect((await cardOutline(page, first!)).outlineOffset).toBe(3)
})

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
    await menu(second, 'Players')
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
    await menu(first, 'Reset game')
    await second.getByRole('button', { name: /Stop reset with/ }).click()
    await expect(first.getByRole('button', { name: /Stop reset with/ })).toHaveCount(0)
    await first.getByRole('button', { name: 'Menu', exact: true }).click()
    await expect(first.getByRole('menuitem', { name: 'Reset game', exact: true })).toBeVisible()
    await first.keyboard.press('Escape')
    await firstContext.setOffline(true)
    await expect(first.getByText('Reconnecting…', { exact: true })).toBeVisible()
    await expect(first.locator('[data-card-id]').first()).toBeDisabled()
    await firstContext.setOffline(false)
    await expect(first.getByText('Live', { exact: true })).toBeVisible({ timeout: 20000 })
    await ready(first)
    expect(await cards(first)).toEqual(await cards(second))
    await first.getByRole('button', { name: 'Menu' }).click()
    await first.getByRole('menuitem', { name: 'Practice' }).click()
    await first.getByRole('button', { name: 'Menu' }).click()
    await expect(first.getByRole('menuitem', { name: /^Multiplayer/ })).toContainText('1')
    await first.getByRole('menuitem', { name: /^Multiplayer/ }).click()
    await expect(first.getByText('Live', { exact: true })).toBeVisible()
  } finally {
    await firstContext.close()
    await secondContext.close()
  }
})
