import { test, expect, type Page, type Request } from '@playwright/test'
import { isSet } from '../../app/javascript/lib/rules'
import { playAsNewPlayer } from './players'

// The Puzzle launched on 2026-10-25 (ClassicPuzzle::LAUNCH_DATE), so Puzzle #1 closed long ago on any clock.
const FIRST = '/puzzle/1'
const FIRST_DATE = '2026-10-25'
const ARCHIVE_SAVE = 'setgame_archive_v1'
const RANKED_SAVES = ['setgame_daily_v1', 'setgame_puzzle_v1']

type Status = { number: number; total: number; me: { attempted: boolean; streak: number } }

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

/** Every request that could change something on the server. */
function recordWrites(page: Page): string[] {
  const writes: string[] = []
  page.on('request', (request: Request) => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/')) writes.push(`${request.method()} ${new URL(request.url()).pathname}`)
  })
  return writes
}

async function stored(page: Page, key: string) {
  return page.evaluate(name => JSON.parse(localStorage.getItem(name) || 'null'), key)
}

async function startPractice(page: Page) {
  await page.getByRole('button', { name: 'Start practice', exact: true }).click()
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
}

test('without scripts, the archive lists past days and a day’s page has its board, solution and leaderboard', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL })
  const page = await context.newPage()
  try {
    await page.goto('/archive')
    await expect(page).toHaveTitle('Set Archive · Every Past Daily Deal and Puzzle')
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://setdaily.app/archive')
    const newest = page.locator('main a[href^="/puzzle/"]').first()
    const href = await newest.getAttribute('href')
    expect(href).toMatch(/^\/puzzle\/[1-9]\d*$/)
    await newest.click()
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Set Puzzle #${href!.split('/').pop()}`)

    await page.goto(FIRST)
    await expect(page).toHaveTitle(/^Set Puzzle #1 · Oct 25, 2026 · Board, Solution and Leaderboard/)
    await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://setdaily.app/puzzle/1')
    await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /^Set Puzzle #1, the daily Set puzzle for Sunday, October 25, 2026/)
    await expect(page.locator('#archive-board')).toBeVisible()
    await expect(page.locator('#archive-board li')).toHaveCount(12)
    await expect(page.locator('#archive-solution ol > li')).toHaveCount(6)
    await expect(page.getByRole('heading', { name: 'Leaderboard', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'All past days', exact: true })).toHaveAttribute('href', '/archive')
    await expect(page.getByRole('link', { name: 'Today’s Puzzle', exact: true })).toHaveAttribute('href', '/puzzle')
  } finally {
    await context.close()
  }
})

test('a past Puzzle is played as practice: nothing is sent, and no ranked save, leaderboard or streak changes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const writes = recordWrites(page)
  const id = await playAsNewPlayer(page)
  const before = await (await page.request.get('/api/puzzle')).json() as Status

  await page.goto(FIRST)
  // The page's own board and solution stay out of sight until the practice run is over.
  await expect(page.locator('#archive-board')).toBeHidden()
  await expect(page.locator('#archive-solution')).toBeHidden()
  await expect(page.getByText('Practice: your time isn’t ranked.')).toBeVisible()
  const finishers = await page.locator('#archive-play').evaluate(node => JSON.parse(node.getAttribute('data-archive')!).total as number)

  await startPractice(page)
  await expect(page.locator('[data-card-id]')).toHaveCount(12)
  await expect(page.locator('[data-archive-game="playing"]')).toBeVisible()
  await expect(page.locator('#archive-board')).toBeHidden()
  const board = await cards(page)
  const sets = allSets(board)
  expect(sets).toHaveLength(6)

  await claim(page, sets[0]!)
  await expect(page.locator('[data-found-set]')).toHaveCount(1)
  await claim(page, sets[0]!)
  await expect(page.getByText('Already found')).toBeVisible()
  const miss = [board[0]!, board[1]!, board.slice(2).find(card => !isSet(board[0]!, board[1]!, card))!]
  await claim(page, miss)
  await expect(page.getByText('Not a set')).toBeVisible()

  // A reload resumes the practice run where it was.
  await page.reload()
  await expect(page.locator('[data-found-set]')).toHaveCount(1)
  expect(await cards(page)).toEqual(board)
  expect((await stored(page, ARCHIVE_SAVE)).run).toMatchObject({ kind: 'puzzle', day: 'puzzle:1', misses: 1, attempts: 'hm' })

  for (const set of sets.slice(1)) await claim(page, set)
  const result = page.locator('[data-archive-result="practice"]')
  await expect(result).toBeVisible()
  await expect(result.getByRole('heading', { name: 'Practice · not ranked' })).toBeVisible()
  await expect(result).toContainText('1 miss')
  await expect(result).toContainText('isn’t on the leaderboard and doesn’t count toward a streak')
  await expect(page.locator('#archive-board')).toBeVisible()
  await expect(page.locator('#archive-solution')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toHaveCount(0)

  const save = await stored(page, ARCHIVE_SAVE)
  expect(save.run).toBeNull()
  expect(save.results['puzzle:1']).toMatchObject({ misses: 1, marks: 'hmhhhhh' })
  for (const ranked of RANKED_SAVES) expect(await stored(page, ranked), ranked).toBeNull()
  expect(writes).toEqual([])

  // It was practice: once is enough, and it stays the result on this browser.
  await page.reload()
  await expect(page.locator('[data-archive-result="practice"]')).toBeVisible()
  await expect(page.locator('[data-card-id]')).toHaveCount(0)
  expect(await page.locator('#archive-play').evaluate(node => JSON.parse(node.getAttribute('data-archive')!).total as number)).toBe(finishers)

  // The server has no trace of it: no result for that day, and today's Puzzle is still unplayed.
  const headers = { 'X-Player-Id': id }
  expect((await (await page.request.get('/api/archive/puzzle/1', { headers })).json()).result).toBeNull()
  const after = await (await page.request.get('/api/puzzle', { headers })).json() as Status
  expect(after.me).toMatchObject({ attempted: false, streak: before.me.streak })
  expect(after.total).toBe(before.total)
  expect(writes).toEqual([])
  expect(errors).toEqual([])
})

test('a practice run can be stopped to see the solution', async ({ page }) => {
  await page.goto(FIRST)
  await startPractice(page)
  const board = await cards(page)
  await claim(page, allSets(board)[0]!)
  await expect(page.locator('[data-found-set]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Stop and show the solution', exact: true }).click()
  await expect(page.locator('#archive-board')).toBeVisible()
  await expect(page.locator('#archive-solution')).toBeVisible()
  await expect(page.locator('[data-card-id]')).toHaveCount(0)
  expect((await stored(page, ARCHIVE_SAVE)).run).toBeNull()
  // Nothing was finished, so the day can still be practised.
  await page.reload()
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Show the board and solution', exact: true }).click()
  await expect(page.locator('#archive-board')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toHaveCount(0)
})

test('a player who finished the day sees that result instead of a game', async ({ page }) => {
  await playAsNewPlayer(page)
  await page.route('**/api/archive/puzzle/1', route => route.fulfill({
    json: { kind: 'puzzle', number: 1, date: FIRST_DATE, result: { elapsed_ms: 83_000, misses: 2, rank: 2, total: 9, marks: 'hhmhmhhh' } }
  }))
  await page.goto(FIRST)
  const result = page.locator('[data-archive-result="ranked"]')
  await expect(result).toBeVisible()
  await expect(result.getByRole('heading', { name: 'Your result on the day' })).toBeVisible()
  await expect(result).toContainText('1:23')
  await expect(result).toContainText('2nd of 9 · 2 misses')
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toHaveCount(0)
  await expect(page.locator('#archive-board')).toBeVisible()
  expect(await stored(page, ARCHIVE_SAVE)).toBeNull()
})

test('the day’s own save in this browser counts as having played, and is left as it was', async ({ page }) => {
  const ranked = { date: FIRST_DATE, status: 'finished', elapsedMs: 61_000, misses: 1, attempts: 'hhmhhhh' }
  await page.addInitScript(save => localStorage.setItem('setgame_puzzle_v1', save), JSON.stringify(ranked))
  await page.goto(FIRST)
  const result = page.locator('[data-archive-result="ranked"]')
  await expect(result).toBeVisible()
  await expect(result).toContainText('1:01')
  await expect(result).toContainText('1 miss')
  await expect(page.getByRole('button', { name: 'Start practice', exact: true })).toHaveCount(0)
  expect(await stored(page, 'setgame_puzzle_v1')).toEqual(ranked)
})

test('today’s number goes to the live game, and neither it nor a later day has an archive page', async ({ page }) => {
  const today = (await (await page.request.get('/api/puzzle')).json() as Status).number
  const live = await page.request.get(`/puzzle/${today}`, { maxRedirects: 0 })
  expect(live.status()).toBe(302)
  expect(new URL(live.headers()['location']!).pathname).toBe('/puzzle')
  for (const path of [`/puzzle/${today + 1}`, `/puzzle/${today + 400}`, '/puzzle/0', '/puzzle/01', '/puzzle/2026-10-25', `/daily/${today + 400}`]) {
    const res = await page.request.get(path, { maxRedirects: 0 })
    expect(res.status(), path).toBe(404)
    expect(await res.text(), path).not.toContain('data-archive')
  }
  for (const path of [`/api/archive/puzzle/${today}`, `/api/archive/puzzle/${today + 1}`, '/api/archive/puzzle/0']) {
    const res = await page.request.get(path)
    expect(res.status(), path).toBe(404)
    expect(await res.json(), path).toEqual({ error: 'not_found' })
  }

  const sitemap = await (await page.request.get('/sitemap.xml')).text()
  expect(sitemap).toContain('<loc>https://setdaily.app/puzzle/1</loc>')
  expect(sitemap).toContain('<loc>https://setdaily.app/archive</loc>')
  expect(sitemap).not.toContain(`<loc>https://setdaily.app/puzzle/${today}</loc>`)
  expect(sitemap).not.toContain(`<loc>https://setdaily.app/puzzle/${today + 1}</loc>`)
})

test('the menu leads to the archive', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Archive', exact: true }).click()
  await expect(page).toHaveURL(/\/archive$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // On the archive itself the menu doesn't offer it again.
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Archive', exact: true })).toHaveCount(0)
})

test('a past Daily Deal is dealt from its seed and played as practice', async ({ page }) => {
  // Daily Deal #1 is the first day a deal was started in this database; on a fresh one it hasn't closed yet.
  const first = await page.request.get('/daily/1', { maxRedirects: 0 })
  test.skip(first.status() !== 200, 'no Daily Deal has closed in this database yet')
  const writes = recordWrites(page)
  await page.goto('/daily/1')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set Daily Deal #1')
  await expect(page.locator('#archive-board')).toBeHidden()
  await startPractice(page)
  await expect(page.locator('[data-card-id]')).toHaveCount(12)

  const opening = await cards(page)
  await claim(page, allSets(opening)[0]!)
  await expect(page.getByText('Set found!')).toBeVisible()
  await page.reload()
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  expect((await stored(page, ARCHIVE_SAVE)).run).toMatchObject({ kind: 'daily', day: 'daily:1', sets: 1 })

  for (let found = 1; found < 30; found++) {
    if (await page.locator('[data-archive-result]').count()) break
    const set = allSets(await cards(page))[0]
    if (!set) break
    await claim(page, set)
    await expect.poll(async () => (await stored(page, ARCHIVE_SAVE)).run?.sets ?? found + 1).toBe(found + 1)
  }
  await expect(page.locator('[data-archive-result="practice"]')).toBeVisible()
  await expect(page.locator('#archive-board')).toBeVisible()
  for (const ranked of RANKED_SAVES) expect(await stored(page, ranked), ranked).toBeNull()
  expect(writes).toEqual([])
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  const fits = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

  test('the archive and a day’s page fit the screen', async ({ page }) => {
    for (const path of ['/archive', FIRST]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(await fits(page), path).toBe(true)
    }
    await startPractice(page)
    expect(await fits(page), 'playing').toBe(true)
  })

  test('a result with its attempts fits the screen, legend included', async ({ page }) => {
    await page.addInitScript(save => localStorage.setItem('setgame_puzzle_v1', save),
      JSON.stringify({ date: FIRST_DATE, status: 'finished', elapsedMs: 61_000, misses: 3, attempts: 'hhmhmhmhh' }))
    await page.goto(FIRST)
    const result = page.locator('[data-archive-result="ranked"]')
    await expect(result).toBeVisible()
    expect(await fits(page)).toBe(true)
    await result.getByRole('button', { name: /Your attempts/ }).click()
    await expect(result.getByRole('tooltip')).toBeVisible()
    expect(await fits(page)).toBe(true)
  })
})
