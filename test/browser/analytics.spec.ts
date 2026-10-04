import { test, expect, type Page } from '@playwright/test'
import { isSet } from '../../app/javascript/lib/rules'

/** Picks an action from the header's overflow menu. */
async function menu(page: Page, name: string) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name, exact: true }).click()
}

const SAVE_KEY = 'setgame_solo_state_v2'
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

function named(events: Event[], name: string) {
  return events.filter(([event]) => event === name).map(([, data]) => data)
}

test('solo funnel events fire once each and abandoned progress is saved on the server', async ({ page }) => {
  const events = await recordEvents(page)
  await page.goto('/')
  await ready(page)
  await expect.poll(() => named(events, 'game_start')).toEqual([{ mode: 'solo', ranked: true }])
  const gameId = (await saved(page)).gameId

  await claim(page, findTriple(await cards(page), false))
  await expect(page.getByRole('status')).toContainText('Not a valid set')
  expect((await saved(page)).misses).toBe(1)
  await claim(page, findTriple(await cards(page)))
  await expect(page.getByText('1 set found', { exact: true })).toBeVisible()
  expect(named(events, 'first_set')).toEqual([{ mode: 'solo', seconds: expect.any(Number) }])

  await page.reload()
  await ready(page)
  expect((await saved(page)).misses).toBe(1)

  const progress = page.waitForRequest(request => request.url().endsWith(`/api/solo/games/${gameId}/progress`))
  await menu(page, 'New game')
  const request = await progress
  expect(request.postDataJSON()).toEqual({ sets_found: 1 })
  expect((await request.response())?.status()).toBe(204)
  await ready(page)
  // The reload already reported this game as left, so starting over does not report it again.
  expect(named(events, 'game_quit')).toEqual([{ mode: 'solo', reason: 'page_hide', sets: 1, seconds: expect.any(Number) }])
  expect(named(events, 'game_start')).toHaveLength(2)
  expect((await saved(page)).misses).toBe(0)
})

test('starting over mid-game and leaving the page are reported as quits', async ({ page }) => {
  const events = await recordEvents(page)
  await page.goto('/')
  await ready(page)
  await claim(page, findTriple(await cards(page)))
  await expect(page.getByText('1 set found', { exact: true })).toBeVisible()
  await menu(page, 'New game')
  await ready(page)
  expect(named(events, 'game_quit')).toEqual([{ mode: 'solo', reason: 'new_game', sets: 1, seconds: expect.any(Number) }])

  await page.goto('/m')
  await expect.poll(() => named(events, 'game_quit')).toHaveLength(2)
  expect(named(events, 'game_quit')[1]).toMatchObject({ mode: 'solo', reason: 'page_hide', sets: 0 })
})

test('a finished solo game reports its time and misses', async ({ page }) => {
  const events = await recordEvents(page)
  await page.goto('/')
  await ready(page)
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key)!)
    Object.assign(state, { board: [1, 2, 3], deck: [], events: [], recentClaims: [], misses: 2, elapsedMs: 95000, startedAtMs: Date.now() - 95000, eligible: false })
    localStorage.setItem(key, JSON.stringify(state))
  }, SAVE_KEY)
  await page.reload()
  await ready(page)
  await claim(page, [1, 2, 3])
  await expect(page.getByText('Finished', { exact: true })).toBeVisible()
  const [complete] = named(events, 'game_complete')
  expect(complete).toMatchObject({ mode: 'solo', misses: 2, sets: 1, ranked: false })
  expect(complete!.seconds).toBeGreaterThanOrEqual(95)
  expect(complete!.seconds).toBeLessThan(110)
  expect(named(events, 'first_set')).toEqual([{ mode: 'solo', seconds: complete!.seconds }])
})

test('a broken or blocked tracker never affects play', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.umami = { track: () => { throw new Error('tracker exploded') } }
  })
  await page.route('**/api/solo/games/*/progress', route => route.abort())
  await page.goto('/')
  await ready(page)
  await claim(page, findTriple(await cards(page)))
  await expect(page.getByText('1 set found', { exact: true })).toBeVisible()
  await menu(page, 'New game')
  await ready(page)
  await expect(page.getByText('0 sets found', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('multiplayer reports joining, the first set, and leaving mid-round', async ({ page }) => {
  const events = await recordEvents(page)
  await page.goto('/m')
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  await ready(page)
  await expect.poll(() => named(events, 'multiplayer_join')).toHaveLength(1)
  expect(named(events, 'game_start')).toEqual([])

  await claim(page, findTriple(await cards(page)))
  await expect(page.getByRole('status')).toContainText('You found a set!')
  expect(named(events, 'game_start')).toEqual([{ mode: 'multi' }])
  await expect.poll(() => named(events, 'first_set')).toEqual([{ mode: 'multi', seconds: expect.any(Number) }])

  await page.getByRole('button', { name: 'Solo', exact: true }).click()
  await ready(page)
  expect(named(events, 'game_quit')).toEqual([{ mode: 'multi', reason: 'leave', sets: 1, seconds: expect.any(Number) }])
})
