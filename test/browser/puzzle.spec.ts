import { test, expect, type Page } from '@playwright/test'
import { isSet } from '../../app/javascript/lib/rules'

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

function allSets(board: number[]): number[][] {
  const sets: number[][] = []
  for (let i = 0; i < board.length; i++)
    for (let j = i + 1; j < board.length; j++)
      for (let k = j + 1; k < board.length; k++)
        if (isSet(board[i]!, board[j]!, board[k]!)) sets.push([board[i]!, board[j]!, board[k]!])
  return sets
}

async function claim(page: Page, triple: number[]) {
  for (const id of triple) await page.locator(`[data-card-id="${id}"]`).click()
}

test('the Puzzle is 12 cards with exactly 6 sets; finding them all lands on a result card', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const events = await recordEvents(page)
  await page.goto('/puzzle')
  await expect(page).toHaveTitle('Set Puzzle — Find all 6 sets in today’s 12 cards')
  await expect(page.getByRole('button', { name: 'Puzzle', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-card-id]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]')).toHaveCount(12)
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()

  const board = await cards(page)
  const sets = allSets(board)
  expect(sets).toHaveLength(6)

  await claim(page, sets[0]!)
  await expect(page.locator('[data-found-set]')).toHaveCount(1)
  // The same set again doesn't count.
  await claim(page, sets[0]!)
  await expect(page.getByText('Already found')).toBeVisible()
  await expect(page.locator('[data-found-set]')).toHaveCount(1)

  // A reload resumes the run with what was found.
  await page.reload()
  await expect(page.locator('[data-found-set]')).toHaveCount(1)
  expect(await cards(page)).toEqual(board)

  // A miss shows up in the share grid, in order.
  const miss = [board[0]!, board[1]!, board.slice(2).find(id => !isSet(board[0]!, board[1]!, id))!]
  await claim(page, miss)
  await expect(page.getByText('Not a set')).toBeVisible()
  for (const set of sets.slice(1)) await claim(page, set)
  const card = page.getByRole('region', { name: /^Puzzle #\d+$/ })
  await expect(card).toBeVisible()
  await expect(card.getByText(/^\d+(st|nd|rd|th) of \d+$/)).toBeVisible()
  await expect(card.getByRole('link', { name: 'Play Daily Deal' })).toHaveAttribute('href', '/')
  expect(events.filter(([name]) => name === 'game_complete').map(([, data]) => data?.mode)).toEqual(['puzzle'])
  await expect(card.locator('[data-share-grid]')).toHaveText('✅❌✅✅✅✅✅')

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await card.getByRole('button', { name: 'Share', exact: true }).click()
  const shared = await page.evaluate(() => navigator.clipboard.readText())
  expect(shared).toMatch(/^Set Puzzle #\d+ · \d+:\d\d\n✅❌✅✅✅✅✅\n🏆 \d+(st|nd|rd|th) of \d+\nhttps:\/\/set\.tido\.site\/puzzle\?r=[\w-]+$/u)
  const link = new URL(shared.split('\n').at(-1)!)
  const preview = await (await page.request.get(link.pathname + link.search, { headers: { 'User-Agent': 'facebookexternalhit/1.1 Facebot Twitterbot/1.0' } })).text()
  const image = preview.match(/<meta property="og:image" content="https:\/\/set\.tido\.site(\/og\/puzzle\/[\w-]+\.png)">/)![1]
  expect((await page.request.get(image)).status()).toBe(200)

  const again = await page.request.post('/api/puzzle/games', { headers: { 'X-Player-Id': await page.evaluate(() => localStorage.getItem('setgame_player_id')!) } })
  expect(again.status()).toBe(409)
  expect(errors).toEqual([])
})

test('a browser that lost its storage gets its player back from the cookie', async ({ page }) => {
  await page.goto('/')
  const id = await page.evaluate(() => localStorage.getItem('setgame_player_id'))
  // Any API call pins the cookie to this player.
  await page.request.get('/api/daily', { headers: { 'X-Player-Id': id! } })
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  expect(await page.evaluate(() => localStorage.getItem('setgame_player_id'))).toBe(id)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true })

  test('the Puzzle and header fit, and Practice and Multiplayer live in the menu', async ({ page }) => {
    await page.goto('/puzzle')
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.locator('[data-card-id]')).toHaveCount(12)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: 'Practice' })).toBeVisible()
    await page.getByRole('menuitem', { name: /^Multiplayer/ }).click()
    await expect(page).toHaveURL(/\/m$/)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
