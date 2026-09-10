import { test, expect, type Page } from '@playwright/test'
import { isSet, cardAttributes } from '../../app/javascript/lib/rules'

const SAVE_KEY = 'setgame_solo_state_v2'

async function ready(page: Page) {
  await expect(page.locator('[data-card-id]').first()).toBeEnabled({ timeout: 20000 })
}

async function validTriple(page: Page) {
  const board = await page.locator('[data-card-id]').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-card-id'))))
  for (let i = 0; i < board.length; i++) for (let j = i + 1; j < board.length; j++) for (let k = j + 1; k < board.length; k++) {
    if (isSet(board[i], board[j], board[k])) return [board[i], board[j], board[k]]
  }
  throw new Error('No set on the board')
}

async function claim(page: Page, triple: number[]) {
  for (const id of triple) await page.locator(`[data-card-id="${id}"]`).click()
}

async function lastSet(page: Page, previousBest: number | null) {
  await page.goto('/')
  await ready(page)
  await page.evaluate(({ key, previousBest }) => {
    const state = JSON.parse(localStorage.getItem(key)!)
    Object.assign(state, { board: [1, 2, 3], deck: [], events: [], recentClaims: [], status: 'playing', elapsedMs: 31000, startedAtMs: Date.now() - 31000, eligible: false })
    localStorage.setItem(key, JSON.stringify(state))
    localStorage.setItem('setgame_solo_best_times', JSON.stringify(previousBest === null ? [] : [{ ms: previousBest, at: new Date().toISOString() }]))
  }, { key: SAVE_KEY, previousBest })
  await page.reload()
  await ready(page)
}

test('both modes use crisp SVG cards and load no PNG card assets', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => { if (/\/cards\/.*\.png/.test(request.url())) requests.push(request.url()) })
  await page.goto('/')
  await ready(page)
  for (const card of await page.locator('[data-card-id]').all()) {
    const id = Number(await card.getAttribute('data-card-id'))
    const attrs = cardAttributes(id)
    await expect(card.locator('svg')).toHaveAttribute('viewBox', '0 0 258 167')
    await expect(card).toHaveAttribute('aria-label', new RegExp(`${attrs.number + 1} `))
  }
  await claim(page, await validTriple(page))
  await expect(page.getByText('1 set found', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Leaderboard' }).getByText('Last sets found')).toBeVisible()
  await expect(page.locator('aside img')).toHaveCount(0)
  await expect(page.locator('aside svg[viewBox="0 0 258 167"]')).toHaveCount(3)
  await page.getByRole('button', { name: 'Leaderboard', exact: true }).click()
  await page.getByRole('button', { name: 'Multiplayer', exact: true }).click()
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  await ready(page)
  await claim(page, await validTriple(page))
  await expect(page.getByRole('status')).toContainText('You found a set!')
  await ready(page)
  await expect(page.locator('[data-card-id] img')).toHaveCount(0)
  expect(requests).toEqual([])
})

test('score feedback runs only for a new claim, not restoration or selecting a card', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  await expect(page.locator('.animate-score-pop')).toHaveCount(0)
  await claim(page, await validTriple(page))
  await expect(page.locator('.animate-score-pop')).toHaveText('1')
  await expect(page.locator('.animate-score-pop')).toHaveCount(0)
  await page.reload()
  await ready(page)
  await expect(page.getByText('1 set found', { exact: true })).toBeVisible()
  await expect(page.locator('.animate-score-pop')).toHaveCount(0)
  await page.locator('[data-card-id]').first().click()
  await expect(page.locator('.animate-score-pop')).toHaveCount(0)
  await page.getByRole('button', { name: 'Multiplayer', exact: true }).click()
  await ready(page)
  await expect(page.locator('.animate-score-pop')).toHaveCount(0)
  await claim(page, await validTriple(page))
  await expect(page.locator('.animate-score-pop')).toHaveCount(1)
  await ready(page)
  await page.reload()
  await ready(page)
  await expect(page.locator('.animate-score-pop')).toHaveCount(0)
})

test('logo secret works by keyboard and touch without affecting either game', async ({ page }) => {
  await page.goto('/')
  await ready(page)
  const initial = await page.locator('[data-card-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-card-id')))
  const logo = page.getByRole('button', { name: 'Set logo', exact: true })
  await logo.focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Enter')
  await expect(page.locator('[data-logo-set]')).toBeVisible()
  await expect(page.getByRole('status')).toContainText('little set')
  expect(await page.locator('[data-card-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-card-id')))).toEqual(initial)
  await expect(page.locator('[data-logo-set]')).toHaveCount(0, { timeout: 6000 })
  await page.setViewportSize({ width: 320, height: 812 })
  await page.getByRole('button', { name: 'Multiplayer', exact: true }).click()
  await ready(page)
  for (let i = 0; i < 3; i++) await logo.click()
  await expect(page.locator('[data-logo-set]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('optional sound stays off by default, plays only when enabled, and persists across routes and reloads', async ({ page }) => {
  await page.addInitScript(() => {
    const state = { contexts: 0, notes: 0, closes: 0 }
    Object.assign(window, { soundTest: state })
    const BaseAudio = window.AudioContext
    class ObservedAudio extends BaseAudio {
      constructor() { super(); state.contexts++ }
      createOscillator() {
        const oscillator = super.createOscillator()
        const start = oscillator.start.bind(oscillator)
        oscillator.start = (when = 0) => { state.notes++; start(when) }
        return oscillator
      }
      close() { state.closes++; return super.close() }
    }
    window.AudioContext = ObservedAudio
  })
  const soundState = () => page.evaluate(() => (window as unknown as { soundTest: { contexts: number; notes: number; closes: number } }).soundTest)
  await page.goto('/')
  await ready(page)
  await expect(page.getByRole('button', { name: 'Enable sound' })).toHaveAttribute('aria-pressed', 'false')
  await claim(page, await validTriple(page))
  expect((await soundState()).contexts).toBe(0)
  await page.getByRole('button', { name: 'Enable sound' }).click()
  await expect.poll(async () => (await soundState()).notes).toBe(1)
  const before = (await soundState()).notes
  await claim(page, await validTriple(page))
  await expect.poll(async () => (await soundState()).notes - before).toBe(5)
  await page.getByRole('button', { name: 'Multiplayer', exact: true }).click()
  await ready(page)
  await expect(page.getByRole('button', { name: 'Mute sound' })).toHaveAttribute('aria-pressed', 'true')
  const beforeMulti = (await soundState()).notes
  await claim(page, await validTriple(page))
  await expect.poll(async () => (await soundState()).notes - beforeMulti).toBe(5)
  await page.getByRole('button', { name: 'Mute sound' }).click()
  expect((await soundState()).closes).toBe(1)
  await page.reload()
  await expect(page.getByRole('button', { name: 'Enable sound' })).toBeVisible()
  expect((await soundState()).contexts).toBe(0)
})

test('enabled sound survives a reload without starting audio automatically', async ({ page }) => {
  await page.addInitScript(() => {
    const BaseAudio = window.AudioContext
    Object.assign(window, { audioContextsCreated: 0 })
    class ObservedAudio extends BaseAudio {
      constructor() {
        super()
        const instrumented = window as unknown as { audioContextsCreated: number }
        instrumented.audioContextsCreated++
      }
    }
    window.AudioContext = ObservedAudio
  })
  await page.goto('/m')
  await ready(page)
  await page.getByRole('button', { name: 'Enable sound' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Mute sound' })).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { audioContextsCreated: number }).audioContextsCreated)).toBe(0)
})

test('sound preferences synchronize between open tabs and native audio starts after a click', async ({ page, context }) => {
  await page.addInitScript(() => {
    const BaseAudio = window.AudioContext
    class ObservedAudio extends BaseAudio {
      constructor() { super(); Object.assign(window, { lastGameAudio: this }) }
    }
    window.AudioContext = ObservedAudio
  })
  await page.goto('/')
  await ready(page)
  const second = await context.newPage()
  await second.goto('/')
  await ready(second)
  await page.getByRole('button', { name: 'Enable sound' }).click()
  await expect(second.getByRole('button', { name: 'Mute sound' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { lastGameAudio?: AudioContext }).lastGameAudio?.state)).toBe('running')
  await second.getByRole('button', { name: 'Mute sound' }).click()
  await expect(page.getByRole('button', { name: 'Enable sound' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as unknown as { lastGameAudio?: AudioContext }).lastGameAudio?.state)).toBe('closed')
  await second.close()
})

test('sound failure and blocked storage leave gameplay usable', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError') }
    Object.defineProperty(window, 'AudioContext', { value: class { constructor() { throw new Error('Audio unavailable') } }, configurable: true })
  })
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: 'Enable sound' }).click()
  await claim(page, await validTriple(page))
  await expect(page.getByText('1 set found', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Multiplayer', exact: true }).click()
  await ready(page)
  await page.getByRole('button', { name: 'Mute sound' }).click()
  expect(errors).toEqual([])
})

test('a new local personal best celebrates once and does not repeat after reload', async ({ page }) => {
  await lastSet(page, 45000)
  await claim(page, [1, 2, 3])
  await expect(page.getByText('New personal best!', { exact: true })).toBeVisible()
  await expect(page.locator('[data-personal-best]')).toContainText('faster than your previous best on this device')
  await expect(page.locator('[data-celebration-particles]')).toBeVisible()
  await expect(page.locator('[data-celebration-particles]')).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('Finished', { exact: true })).toBeVisible()
  await expect(page.locator('[data-personal-best]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Play again', exact: true }).click()
  await ready(page)
  await expect(page.locator('[data-personal-best]')).toHaveCount(0)
})

test('first completions and slower times do not falsely claim a personal best', async ({ page }) => {
  for (const best of [null, 1000]) {
    await lastSet(page, best)
    await claim(page, [1, 2, 3])
    await expect(page.getByText('Finished', { exact: true })).toBeVisible()
    await expect(page.locator('[data-personal-best]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Play again', exact: true }).click()
    await ready(page)
  }
})

test('reduced motion keeps achievement text and logo secret without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await lastSet(page, 45000)
  await claim(page, [1, 2, 3])
  await expect(page.getByText('New personal best!', { exact: true })).toBeVisible()
  await expect(page.locator('[data-celebration-particles]')).toHaveCount(0)
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Set logo', exact: true }).click()
  await expect(page.locator('[data-logo-set]')).toBeVisible()
  expect(await page.locator('[data-logo-set]').evaluate(node => getComputedStyle(node).animationName)).toBe('none')
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the HUD stays in one line above the board at every width in ${colorScheme} mode`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    await ready(page)
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const timer = await page.getByRole('timer').boundingBox()
      const pause = await page.getByRole('button', { name: 'Pause', exact: true }).boundingBox()
      const card = await page.locator('[data-card-id]').first().boundingBox()
      expect(timer).not.toBeNull()
      expect(pause).not.toBeNull()
      expect(card).not.toBeNull()
      expect(timer!.y + timer!.height).toBeLessThanOrEqual(card!.y)
      expect(Math.abs(pause!.y + pause!.height / 2 - (timer!.y + timer!.height / 2))).toBeLessThan(8)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.getByRole('button', { name: 'Pause', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Resume game' })).toBeVisible()
      await page.getByRole('button', { name: 'Resume game' }).click()
      await ready(page)
    }
  })
}
