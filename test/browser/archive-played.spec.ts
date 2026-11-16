import { test, expect, type Browser, type Page, type Request } from '@playwright/test'
import { isSet } from '../../app/javascript/lib/rules'
import { playAsNewPlayer } from './players'

// /archive is served the same to everyone; its script marks each day's tile
// with what this player did that day. The Puzzle launched on 2026-10-25
// (ClassicPuzzle::LAUNCH_DATE), so on any clock since early November 2026
// the first page lists at least four past Puzzles to mark.
const ARCHIVE_SAVE = 'setgame_archive_v1'
const RANKED_SAVES = ['setgame_daily_v1', 'setgame_puzzle_v1']

type Tile = { key: string; number: number; date: string }

async function puzzleTiles(page: Page): Promise<Tile[]> {
  const tiles = await page.locator('a[data-archive-tile^="puzzle:"]').evaluateAll(links => links.map(link => ({
    key: link.getAttribute('data-archive-tile')!,
    number: Number(link.getAttribute('data-archive-tile')!.split(':')[1]),
    date: link.getAttribute('data-archive-date')!
  })))
  expect(tiles.length).toBeGreaterThanOrEqual(4)
  return tiles
}

const tile = (page: Page, key: string) => page.locator(`a[data-archive-tile="${key}"]`)
const status = (page: Page, key: string) => tile(page, key).locator('[data-archive-status]')

/** Every request to the API, as "METHOD /path?query". */
function recordApi(page: Page): string[] {
  const calls: string[] = []
  page.on('request', (request: Request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/')) calls.push(`${request.method()} ${url.pathname}${url.search}`)
  })
  return calls
}

async function stored(page: Page, key: string) {
  return page.evaluate(name => JSON.parse(localStorage.getItem(name) || 'null'), key)
}

/** Answers the archive's played-days request as a player who finished these Puzzles on the day. */
async function serverRemembers(page: Page, puzzles: Record<number, number>) {
  await page.route('**/api/archive?page=*', route => route.fulfill({
    json: { page: 1, daily: {}, puzzle: Object.fromEntries(Object.entries(puzzles).map(([number, elapsed_ms]) => [number, { elapsed_ms }])) }
  }))
}

async function withoutScripts<T>(browser: Browser, baseURL: string | undefined, viewport: { width: number; height: number }, run: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL, viewport })
  try {
    return await run(await context.newPage())
  } finally {
    await context.close()
  }
}

const listHeight = (page: Page) => page.locator('main ol').evaluate(list => list.getBoundingClientRect().height)

test('a player with no history is invited to play every day, and asking writes nothing', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const calls = recordApi(page)
  await playAsNewPlayer(page)
  await page.goto('/archive')
  const tiles = await puzzleTiles(page)

  const count = await page.locator('a[data-archive-tile]').count()
  await expect(page.locator('a[data-archive-tile][data-played="unplayed"]')).toHaveCount(count)
  await expect(status(page, tiles[0]!.key)).toHaveText('Not played. Play→')
  await expect(tile(page, tiles[0]!.key)).toHaveAccessibleName(new RegExp(`^Puzzle #${tiles[0]!.number} .*Not played\\. Play`))
  expect(calls).toEqual(['GET /api/archive?page=1'])
  for (const save of [ARCHIVE_SAVE, ...RANKED_SAVES]) expect(await stored(page, save), save).toBeNull()
  expect(errors).toEqual([])
})

test('a day shows the player’s own time: from the day itself, or from practice, and which', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await playAsNewPlayer(page)
  await page.goto('/archive')
  const [onTheDay, practised, running, untouched] = await puzzleTiles(page)

  const calls = recordApi(page)
  const save = {
    results: {
      [practised!.key]: { elapsedMs: 241_000, misses: 2, finishedAtMs: 1 },
      // Practised as well as played on the day: the day itself is what shows.
      [onTheDay!.key]: { elapsedMs: 9_000, misses: 0, finishedAtMs: 1 }
    },
    run: { kind: 'puzzle', day: running!.key, startedAtMs: 1, found: [], misses: 0, attempts: '' }
  }
  await page.addInitScript(([key, value]) => localStorage.setItem(key!, value!), [ARCHIVE_SAVE, JSON.stringify(save)])
  await serverRemembers(page, { [onTheDay!.number]: 83_000 })
  await page.reload()

  await expect(tile(page, onTheDay!.key)).toHaveAttribute('data-played', 'ranked')
  await expect(status(page, onTheDay!.key)).toHaveText('Your time 1:23 On the day')
  await expect(status(page, onTheDay!.key).locator('svg')).toBeVisible()
  await expect(tile(page, onTheDay!.key)).toHaveAccessibleName(new RegExp(`^Puzzle #${onTheDay!.number} .*Your time 1:23 On the day$`))

  await expect(tile(page, practised!.key)).toHaveAttribute('data-played', 'practice')
  await expect(status(page, practised!.key)).toHaveText('Your time 4:01 Practice')
  await expect(status(page, practised!.key).locator('svg')).toBeVisible()

  await expect(tile(page, running!.key)).toHaveAttribute('data-played', 'running')
  await expect(status(page, running!.key)).toHaveText('Resume practice→')

  await expect(tile(page, untouched!.key)).toHaveAttribute('data-played', 'unplayed')
  await expect(status(page, untouched!.key)).toHaveText('Not played. Play→')
  await expect(status(page, untouched!.key).locator('svg')).toHaveCount(0)

  // A played tile is tinted; an unplayed one keeps the plain tile.
  const background = (key: string) => tile(page, key).evaluate(link => getComputedStyle(link).backgroundColor)
  const plain = await background(untouched!.key)
  expect(await background(onTheDay!.key)).not.toBe(plain)
  expect(await background(practised!.key)).not.toBe(plain)
  expect(await background(onTheDay!.key)).not.toBe(await background(practised!.key))
  expect(await background(running!.key)).toBe(plain)

  // The tiles still lead to their days, and marking them changed nothing that is saved.
  await expect(tile(page, onTheDay!.key)).toHaveAttribute('href', `/puzzle/${onTheDay!.number}`)
  expect(calls).toEqual(['GET /api/archive?page=1'])
  expect(await stored(page, ARCHIVE_SAVE)).toEqual(save)
  for (const ranked of RANKED_SAVES) expect(await stored(page, ranked), ranked).toBeNull()
  expect(errors).toEqual([])
})

test('when the server can’t be reached, what this browser remembers is marked and nothing is called unplayed', async ({ page }) => {
  await playAsNewPlayer(page)
  await page.goto('/archive')
  const [onTheDay, practised, untouched] = await puzzleTiles(page)

  await page.addInitScript(([date, practisedKey]) => {
    // The day's own finished run, still in this browser from when it was live.
    localStorage.setItem('setgame_puzzle_v1', JSON.stringify({ date, status: 'finished', elapsedMs: 61_000, misses: 1, attempts: 'hhmhhhh' }))
    localStorage.setItem('setgame_archive_v1', JSON.stringify({ results: { [practisedKey!]: { elapsedMs: 75_000, misses: 0, finishedAtMs: 1 } }, run: null }))
  }, [onTheDay!.date, practised!.key])
  await page.route('**/api/archive?page=*', route => route.abort())
  const failed = page.waitForEvent('requestfailed', request => new URL(request.url()).pathname === '/api/archive')
  await page.reload()

  await expect(status(page, onTheDay!.key)).toHaveText('Your time 1:01 On the day')
  await expect(status(page, practised!.key)).toHaveText('Your time 1:15 Practice')
  await failed
  await expect(page.locator('[data-played="unplayed"]')).toHaveCount(0)
  await expect(tile(page, untouched!.key)).not.toHaveAttribute('data-played')
  await expect(status(page, untouched!.key)).toBeEmpty()
  expect(await stored(page, 'setgame_puzzle_v1')).toMatchObject({ date: onTheDay!.date, status: 'finished', elapsedMs: 61_000 })
})

test('practising a day from the archive marks it on the list: in progress, then with the time', async ({ page }) => {
  await playAsNewPlayer(page)
  await page.goto('/archive')
  const [day] = await puzzleTiles(page)
  await expect(tile(page, day!.key)).toHaveAttribute('data-played', 'unplayed')

  await tile(page, day!.key).click()
  await expect(page).toHaveURL(new RegExp(`/puzzle/${day!.number}$`))
  await page.getByRole('button', { name: 'Start practice', exact: true }).click()
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  const board = await page.locator('[data-card-id]').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-card-id'))))
  const sets: number[][] = []
  for (let i = 0; i < board.length; i++)
    for (let j = i + 1; j < board.length; j++)
      for (let k = j + 1; k < board.length; k++)
        if (isSet(board[i]!, board[j]!, board[k]!)) sets.push([board[i]!, board[j]!, board[k]!])
  expect(sets).toHaveLength(6)
  const claim = async (set: number[]) => {
    for (const id of set) await page.locator(`[data-card-id="${id}"]`).click()
  }
  await claim(sets[0]!)
  await expect(page.locator('[data-found-set]')).toHaveCount(1)

  // Back on the list without a reload, the day reads as a practice run to pick up.
  await page.goBack()
  await expect(page).toHaveURL(/\/archive$/)
  await expect(tile(page, day!.key)).toHaveAttribute('data-played', 'running')
  await expect(status(page, day!.key)).toHaveText('Resume practice→')

  await tile(page, day!.key).click()
  await expect(page.locator('[data-found-set]')).toHaveCount(1)
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  for (const set of sets.slice(1)) await claim(set)
  await expect(page.locator('[data-archive-result="practice"]')).toBeVisible()
  const elapsedMs = (await stored(page, ARCHIVE_SAVE)).results[day!.key].elapsedMs as number
  const time = `${Math.floor(elapsedMs / 60_000)}:${String(Math.floor(elapsedMs / 1000) % 60).padStart(2, '0')}`

  await page.goBack()
  await expect(page).toHaveURL(/\/archive$/)
  await expect(tile(page, day!.key)).toHaveAttribute('data-played', 'practice')
  await expect(status(page, day!.key)).toHaveText(`Your time ${time} Practice`)
  // A fresh load says the same, and the server still has nothing for this player.
  await page.reload()
  await expect(status(page, day!.key)).toHaveText(`Your time ${time} Practice`)
  const answer = await (await page.request.get('/api/archive', { headers: { 'X-Player-Id': await page.evaluate(() => localStorage.getItem('setgame_player_id')!) } })).json()
  expect(answer).toEqual({ page: 1, daily: {}, puzzle: {} })
})

test('the list is served unmarked, and the same to a browser with a history as to one without scripts', async ({ page, browser, baseURL }) => {
  await playAsNewPlayer(page)
  await page.goto('/archive')
  const [day] = await puzzleTiles(page)
  await page.evaluate(([key, value]) => localStorage.setItem(key!, value!), [ARCHIVE_SAVE, JSON.stringify({ results: { [day!.key]: { elapsedMs: 75_000, misses: 0, finishedAtMs: 1 } }, run: null })])

  const served = async (get: () => Promise<string>) => (await get()).match(/<main\b[\s\S]*<\/main>/)![0]
  const mine = await served(async () => (await page.request.get('/archive')).text())
  expect(mine).not.toContain('data-played')
  expect(mine).not.toContain('On the day')
  expect(mine).toContain(`data-archive-tile="${day!.key}"`)

  await withoutScripts(browser, baseURL, { width: 1440, height: 1000 }, async plain => {
    await plain.goto('/archive')
    expect(await served(async () => (await plain.request.get('/archive')).text())).toBe(mine)
    await expect(plain.locator('[data-played]')).toHaveCount(0)
    const slots = plain.locator('a[data-archive-tile] [data-archive-status]')
    expect(await slots.count()).toBeGreaterThanOrEqual(4)
    expect(await slots.evaluateAll(nodes => nodes.every(node => node.childNodes.length === 0))).toBe(true)
    // Without the script a tile is still the link to its day, with the day's own figures.
    await expect(plain.locator(`a[data-archive-tile="${day!.key}"]`)).toHaveAccessibleName(new RegExp(`^Puzzle #${day!.number} (\\d+ finishers? · best \\d+:\\d\\d|No finishers)$`))
    await plain.locator(`a[data-archive-tile="${day!.key}"]`).click()
    await expect(plain).toHaveURL(new RegExp(`/puzzle/${day!.number}$`))
  })
})

test('the next page of the archive asks for its own days', async ({ page }) => {
  await playAsNewPlayer(page)
  await page.goto('/archive')
  const older = page.locator('a[rel=next]')
  test.skip(await older.count() === 0, 'the archive in this database is one page long')
  const calls = recordApi(page)
  const asked = page.waitForResponse(response => new URL(response.url()).pathname === '/api/archive')
  await older.click()
  await expect(page).toHaveURL(/\/archive\?page=2$/)
  await expect(page.locator('ol[data-archive-page="2"]')).toBeVisible()
  expect((await asked).status()).toBe(200)
  const count = await page.locator('a[data-archive-tile]').count()
  await expect(page.locator('a[data-archive-tile][data-played="unplayed"]')).toHaveCount(count)
  expect(calls).toEqual(['GET /api/archive?page=2'])
})

for (const [name, viewport] of [['a phone', { width: 390, height: 844 }], ['a desktop', { width: 1280, height: 900 }]] as const) {
  test.describe(`on ${name}`, () => {
    test.use({ viewport })

    test('marked tiles fit the screen, and marking them doesn’t move the list', async ({ page, browser, baseURL }) => {
      const unmarked = await withoutScripts(browser, baseURL, viewport, async plain => {
        await plain.goto('/archive')
        return listHeight(plain)
      })

      await playAsNewPlayer(page)
      await page.goto('/archive')
      const [onTheDay, practised, running] = await puzzleTiles(page)
      await page.addInitScript(([key, value]) => localStorage.setItem(key!, value!), [ARCHIVE_SAVE, JSON.stringify({
        results: { [practised!.key]: { elapsedMs: 3_599_000, misses: 0, finishedAtMs: 1 } },
        run: { kind: 'puzzle', day: running!.key, startedAtMs: 1, found: [], misses: 0, attempts: '' }
      })])
      await serverRemembers(page, { [onTheDay!.number]: 3_599_000 })
      await page.reload()
      await expect(status(page, onTheDay!.key)).toHaveText('Your time 59:59 On the day')
      await expect(status(page, practised!.key)).toHaveText('Your time 59:59 Practice')
      await expect(page.locator('[data-played="unplayed"]').first()).toBeVisible()

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
      expect(await listHeight(page)).toBe(unmarked)
      // Each mark sits inside its own tile.
      for (const key of [onTheDay!.key, practised!.key, running!.key]) {
        const [box, inner] = await Promise.all([tile(page, key).boundingBox(), status(page, key).boundingBox()])
        expect(inner!.x).toBeGreaterThanOrEqual(box!.x)
        expect(inner!.x + inner!.width).toBeLessThanOrEqual(box!.x + box!.width)
        expect(inner!.y + inner!.height).toBeLessThanOrEqual(box!.y + box!.height)
      }
    })

    test('the Puzzle’s tile is on the left and the Daily Deal’s on the right, and each game’s mark lands on its own tile', async ({ page }) => {
      await playAsNewPlayer(page)
      await page.goto('/archive')
      await puzzleTiles(page)

      // Every row's tiles as served: which cell of the row's grid each is in, and where that puts it on screen.
      const rows = await page.locator('main ol > li').evaluateAll(items => items.map(item => Array.from(item.querySelectorAll('a[data-archive-tile]'), link => {
        const grid = link.parentElement!
        const [box, around] = [link.getBoundingClientRect(), grid.getBoundingClientRect()]
        return {
          key: link.getAttribute('data-archive-tile')!,
          date: link.getAttribute('data-archive-date')!,
          cell: Array.from(grid.children).indexOf(link),
          cells: grid.children.length,
          fromLeft: box.left - around.left,
          fromRight: around.right - box.right,
          width: box.width
        }
      })))
      for (const tiles of rows) {
        for (const placed of tiles) {
          expect(placed.cells, placed.key).toBe(2)
          if (placed.key.startsWith('puzzle:')) {
            expect(placed.cell, placed.key).toBe(0)
            expect(Math.abs(placed.fromLeft), placed.key).toBeLessThanOrEqual(1)
            expect(placed.fromRight, placed.key).toBeGreaterThanOrEqual(placed.width)
          } else {
            expect(placed.cell, placed.key).toBe(1)
            expect(Math.abs(placed.fromRight), placed.key).toBeLessThanOrEqual(1)
            expect(placed.fromLeft, placed.key).toBeGreaterThanOrEqual(placed.width)
          }
        }
        expect(new Set(tiles.map(placed => placed.date)).size, 'a row is one day').toBeLessThanOrEqual(1)
      }

      // A day with both games when this database has one (its Puzzle on the left), else the newest Puzzle.
      const row = rows.find(tiles => tiles.length === 2) ?? rows.find(tiles => tiles.some(placed => placed.key.startsWith('puzzle:')))!
      const puzzle = row.find(placed => placed.key.startsWith('puzzle:'))!.key
      const daily = row.find(placed => placed.key.startsWith('daily:'))?.key
      // Without a Daily Deal that day, the answer still names one, by the Puzzle's own number: a mark goes by game as well as number.
      const dailyNumber = (daily ?? puzzle).split(':')[1]!
      await page.route('**/api/archive?page=*', route => route.fulfill({
        json: { page: 1, puzzle: { [puzzle.split(':')[1]!]: { elapsed_ms: 31_000 } }, daily: { [dailyNumber]: { elapsed_ms: 190_000 } } }
      }))
      await page.reload()

      const count = await page.locator('a[data-archive-tile]').count()
      await expect(page.locator('a[data-archive-tile][data-played]')).toHaveCount(count)
      await expect(status(page, puzzle)).toHaveText('Your time 0:31 On the day')
      if (daily) await expect(status(page, daily)).toHaveText('Your time 3:10 On the day')

      // Those marks and no others: the Puzzle's time is on no Daily Deal tile, nor the Daily Deal's on a Puzzle's.
      const keys = rows.flat().map(placed => placed.key)
      const expected: Record<string, string> = { [puzzle]: 'Your time 0:31 On the day' }
      if (keys.includes(`daily:${dailyNumber}`)) expected[`daily:${dailyNumber}`] = 'Your time 3:10 On the day'
      const marked = await page.locator('a[data-archive-tile][data-played="ranked"]').evaluateAll(links => Object.fromEntries(links.map(link => [
        link.getAttribute('data-archive-tile')!,
        link.querySelector('[data-archive-status]')!.textContent
      ])))
      expect(marked).toEqual(expected)
      await expect(page.locator('a[data-archive-tile][data-played="unplayed"]')).toHaveCount(count - Object.keys(expected).length)

      // On screen, the Puzzle's time is in the left tile and the Daily Deal's in the right one.
      if (daily) {
        const [left, right] = await Promise.all([status(page, puzzle).boundingBox(), status(page, daily).boundingBox()])
        const [puzzleBox, dailyBox] = await Promise.all([tile(page, puzzle).boundingBox(), tile(page, daily).boundingBox()])
        expect(puzzleBox!.x + puzzleBox!.width).toBeLessThanOrEqual(dailyBox!.x)
        expect(left!.x + left!.width).toBeLessThanOrEqual(puzzleBox!.x + puzzleBox!.width)
        expect(right!.x).toBeGreaterThanOrEqual(dailyBox!.x)
      }
    })
  })
}
