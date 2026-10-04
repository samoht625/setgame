import { test, expect, type Page } from '@playwright/test'
import { isSet } from '../../app/javascript/lib/rules'

const SAVE_KEY = 'setgame_daily_v1'
const ME = '0a0a0a0a-1111-4222-8333-444444444444'
const PHONE = { width: 375, height: 740 }

test.use({ viewport: PHONE })

function today() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** A fresh player for specs that really start today's daily (one try per player per day). */
async function asNewPlayer(page: Page) {
  await page.addInitScript(id => { if (!localStorage.getItem('setgame_player_id')) localStorage.setItem('setgame_player_id', id) }, crypto.randomUUID())
}

async function asPlayer(page: Page, name?: string) {
  await page.addInitScript(({ id, name }) => {
    localStorage.setItem('setgame_player_id', id)
    if (name && !sessionStorage.getItem('named')) {
      localStorage.setItem(`setgame_player_name:${id}`, name)
      sessionStorage.setItem('named', '1')
    }
  }, { id: ME, name })
}

const savedName = (page: Page) => page.evaluate(() => localStorage.getItem(`setgame_player_name:${localStorage.getItem('setgame_player_id')}`))

/** A finished, submitted run for today plus a made-up leaderboard where the player's row is Anonymous. */
async function finishedAnonymously(page: Page) {
  const date = today()
  let myName: string | null = null
  await page.route('**/api/daily', route => route.fulfill({
    json: {
      date,
      number: 12,
      next_at: new Date(Date.now() + 5 * 3600_000).toISOString(),
      total: 5,
      leaderboard: [
        { player_id: 'p1', display_name: 'Maya', elapsed_ms: 71_000, misses: 0, completed_at: new Date().toISOString() },
        { player_id: 'p2', display_name: 'Jonah', elapsed_ms: 84_000, misses: 1, completed_at: new Date().toISOString() },
        { player_id: ME, display_name: myName, elapsed_ms: 96_000, misses: 0, completed_at: new Date().toISOString() },
        { player_id: 'p3', display_name: null, elapsed_ms: 103_000, misses: 2, completed_at: new Date().toISOString() },
        { player_id: 'p4', display_name: 'Priya', elapsed_ms: 128_000, misses: 0, completed_at: new Date().toISOString() }
      ],
      me: { attempted: true, streak: 3, result: { display_name: myName, elapsed_ms: 96_000, misses: 0, rank: 3, total: 5, share_token: 'x' } }
    }
  }))
  const renames: Array<Record<string, unknown>> = []
  let failNext = false
  await page.route('**/api/daily/name', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    renames.push(body)
    if (failNext) {
      failNext = false
      return route.fulfill({ status: 503, json: { error: 'down' } })
    }
    myName = String(body.display_name)
    return route.fulfill({ json: { ok: true, display_name: myName } })
  })
  await page.addInitScript(({ key, date }) => {
    localStorage.setItem(key, JSON.stringify({
      ranked: {
        date, number: 12, gameId: 'my-game', seed: 1, board: [1, 2, 4], deck: [], rngState: 0, status: 'finished',
        startedAtMs: Date.now() - 200_000, elapsedMs: 96_000, events: [{ type: 'claim', cards: [1, 2, 3], t_ms: 96_000 }], misses: 0, submission: 'submitted'
      }
    }))
  }, { key: SAVE_KEY, date })
  return { renames, failOnce: () => { failNext = true } }
}

async function cards(page: Page): Promise<number[]> {
  return page.locator('[data-card-id]').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-card-id'))))
}

function findSet(board: number[]): number[] {
  for (let i = 0; i < board.length; i++) for (let j = i + 1; j < board.length; j++) for (let k = j + 1; k < board.length; k++) {
    if (isSet(board[i]!, board[j]!, board[k]!)) return [board[i]!, board[j]!, board[k]!]
  }
  throw new Error('no set')
}

test('the daily intro asks for an optional name and saves it on Start', async ({ page }) => {
  await asNewPlayer(page)
  await page.goto('/daily')
  const field = page.getByLabel('Name for the leaderboard')
  await expect(field).toBeVisible()
  await expect(field).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeInViewport({ ratio: 1 })
  await field.fill('<b>')
  await expect(page.getByText('Letters, numbers, spaces, _ and - only')).toBeVisible()
  await field.fill('  Ada  L ')
  await expect(page.getByText('Letters, numbers, spaces, _ and - only')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: 'tmp/name-intro.png' })
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  expect(await savedName(page)).toBe('Ada L')
})

test('the name field never blocks starting and is skipped once a name is saved', async ({ page, browser }) => {
  await asNewPlayer(page)
  await page.goto('/daily')
  await page.getByLabel('Name for the leaderboard').fill('Nope!')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  expect(await savedName(page)).toBeNull()

  const named = await browser.newPage({ viewport: PHONE })
  await named.addInitScript(() => localStorage.setItem('setgame_name', 'Old Name'))
  await named.goto('/daily')
  await expect(named.getByText('Same deal for everyone today.')).toBeVisible()
  await expect(named.getByLabel('Name for the leaderboard')).toHaveCount(0)
  await named.close()
})

test('an Anonymous result row offers Add your name, edited in place, and only sends the player’s own game', async ({ page }) => {
  await asPlayer(page)
  const api = await finishedAnonymously(page)
  await page.goto('/daily')
  const card = page.getByRole('region', { name: 'Set Daily #12' })
  const mine = card.locator('li[aria-current="true"]')
  const add = mine.getByRole('button', { name: 'Add your name' })
  await expect(add).toBeVisible()
  await expect(add).toBeInViewport({ ratio: 1 })
  // Only the player's own row; another Anonymous row has no button.
  await expect(card.getByRole('button', { name: 'Add your name' })).toHaveCount(1)
  await page.screenshot({ path: 'tmp/name-card-anonymous.png' })

  await add.click()
  const input = mine.getByRole('textbox', { name: 'Your name' })
  await expect(input).toBeFocused()
  await input.fill('Sam')
  await page.screenshot({ path: 'tmp/name-editing.png' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  // A failed save keeps the editor open with a note.
  api.failOnce()
  await input.press('Enter')
  await expect(mine.getByText('Couldn’t save. Try again.')).toBeVisible()
  await expect(input).toBeVisible()
  expect(await savedName(page)).toBeNull()

  await mine.getByRole('button', { name: 'Save' }).click()
  await expect(mine).toContainText('Sam')
  await expect(card.getByRole('button', { name: 'Add your name' })).toHaveCount(0)
  expect(api.renames).toEqual([{ game_id: 'my-game', display_name: 'Sam' }, { game_id: 'my-game', display_name: 'Sam' }])
  expect(await savedName(page)).toBe('Sam')
})

test('Escape cancels editing without saving', async ({ page }) => {
  await asPlayer(page)
  const api = await finishedAnonymously(page)
  await page.goto('/daily')
  const mine = page.locator('li[aria-current="true"]')
  await mine.getByRole('button', { name: 'Add your name' }).click()
  await mine.getByRole('textbox', { name: 'Your name' }).fill('Zed')
  await page.keyboard.press('Escape')
  await expect(mine.getByRole('button', { name: 'Add your name' })).toBeVisible()
  expect(api.renames).toEqual([])
})

test('the header menu edits the name, and it also goes on today’s Anonymous score', async ({ page }) => {
  await asPlayer(page, 'Old')
  const api = await finishedAnonymously(page)
  await page.goto('/daily')
  await expect(page.getByRole('button', { name: 'Add your name' })).toBeVisible()
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Your name', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Your name' })
  await expect(dialog).toBeVisible()
  const input = dialog.getByRole('textbox', { name: 'Your name' })
  await expect(input).toHaveValue('Old')
  await input.fill('New Me')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  expect(await savedName(page)).toBe('New Me')
  await expect.poll(() => api.renames).toEqual([{ game_id: 'my-game', display_name: 'New Me' }])
  await expect(page.locator('li[aria-current="true"]')).toContainText('New Me')
})

test('the menu name shows up at the multiplayer table right away', async ({ page }) => {
  await asPlayer(page)
  await page.goto('/m')
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Your name', exact: true }).click()
  await page.getByRole('dialog', { name: 'Your name' }).getByRole('textbox', { name: 'Your name' }).fill('Table Name')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: /Table Name/ }).first()).toBeVisible()
})

test('end to end: finish the daily anonymously, then add a name that sticks on the leaderboard', async ({ page }) => {
  test.setTimeout(120_000)
  await asNewPlayer(page)
  await page.goto('/daily')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  // The server refuses runs under 30 seconds.
  await page.waitForTimeout(30_500)
  for (let turn = 0; turn < 30; turn++) {
    const run = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').ranked, SAVE_KEY)
    if (run?.status === 'finished') break
    for (const id of findSet(await cards(page))) await page.locator(`[data-card-id="${id}"]`).click()
    await page.waitForTimeout(250)
  }
  // The player's row, in the top ten or below it.
  const mine = page.getByRole('region', { name: /^Set Daily #\d+$/ }).locator('[aria-current="true"]')
  await mine.getByRole('button', { name: 'Add your name' }).click()
  await mine.getByRole('textbox', { name: 'Your name' }).fill('E2E Player')
  await mine.getByRole('button', { name: 'Save' }).click()
  await expect(mine).toContainText('E2E Player')
  await page.reload()
  await expect(mine).toContainText('E2E Player')
  await expect(page.getByRole('button', { name: 'Add your name' })).toHaveCount(0)
})
