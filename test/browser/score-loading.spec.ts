import { test, expect, type Page } from '@playwright/test'
import type { LeaderboardEntry } from '../../app/javascript/lib/solo_api'

const SAVE_KEY = 'setgame_solo_state_v2'

function entry(name: string, elapsedMs = 120000): LeaderboardEntry {
  return { player_id: name, display_name: name, elapsed_ms: elapsedMs, completed_at: '2026-09-09T12:00:00Z' }
}

function personalBests() {
  return { daily: entry('daily best', 61000), weekly: entry('weekly best', 122000), monthly: entry('monthly best', 183000), all_time: null }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

async function expectBest(page: Page, time: string) {
  await expect(page.getByText('Your best', { exact: true }).locator('..')).toContainText(time)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/solo/games', route => route.fulfill({
    json: { game_id: '00000000-0000-4000-8000-000000000001', seed: 123, rules_version: 1 }
  }))
})

test('personal bests load independently and stay cached through period changes', async ({ page }) => {
  const personalReady = deferred()
  const weeklyReady = deferred()
  const weeklyFinished = deferred()
  const periods: string[] = []
  let personalRequests = 0
  await page.route('**/api/solo/personal_bests', async route => {
    personalRequests++
    await personalReady.promise
    await route.fulfill({ json: personalBests() })
  })
  await page.route('**/api/solo/leaderboard?*', async route => {
    const period = new URL(route.request().url()).searchParams.get('period')!
    periods.push(period)
    if (period === 'weekly') await weeklyReady.promise
    await route.fulfill({ json: { entries: [entry(`${period} leader`)] } })
    if (period === 'weekly') weeklyFinished.resolve()
  })

  await page.goto('/')
  await expect(page.getByText('daily leader', { exact: true })).toBeVisible()
  await expect.poll(() => personalRequests).toBe(1)
  await page.getByRole('button', { name: 'weekly', exact: true }).click()
  await expect.poll(() => periods.includes('weekly')).toBe(true)
  await page.getByRole('button', { name: 'monthly', exact: true }).click()
  await expect(page.getByText('monthly leader', { exact: true })).toBeVisible()
  personalReady.resolve()
  await expectBest(page, '3:03')
  weeklyReady.resolve()
  await weeklyFinished.promise
  await expect(page.getByText('weekly leader', { exact: true })).toHaveCount(0)
  await expect(page.getByText('monthly leader', { exact: true })).toBeVisible()

  for (const [period, time] of [['daily', '1:01'], ['weekly', '2:02'], ['monthly', '3:03']]) {
    await page.getByRole('button', { name: period, exact: true }).click()
    await expect(page.getByText(`${period} leader`, { exact: true })).toBeVisible()
    await expectBest(page, time)
  }
  expect(personalRequests).toBe(1)
  expect(periods).toEqual(['daily', 'weekly', 'monthly', 'daily', 'weekly', 'monthly'])
})

test('personal-best failures leave leaderboards usable and explicit retry refreshes both', async ({ page }) => {
  let personalRequests = 0
  let failPersonal = true
  let failLeaderboard = false
  await page.route('**/api/solo/personal_bests', route => {
    personalRequests++
    return route.fulfill({ status: failPersonal ? 503 : 200, json: failPersonal ? {} : personalBests() })
  })
  await page.route('**/api/solo/leaderboard?*', route => {
    const period = new URL(route.request().url()).searchParams.get('period')!
    return route.fulfill({ status: failLeaderboard ? 503 : 200, json: { entries: [entry(`${period} leader`)] } })
  })

  await page.goto('/')
  await expect(page.getByText('daily leader', { exact: true })).toBeVisible()
  await expect(page.getByText('Could not load times.', { exact: true })).toHaveCount(0)
  failLeaderboard = true
  await page.getByRole('button', { name: 'weekly', exact: true }).click()
  await expect(page.getByText('Could not load times.', { exact: true })).toBeVisible()
  expect(personalRequests).toBe(1)

  failPersonal = false
  failLeaderboard = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('weekly leader', { exact: true })).toBeVisible()
  await expectBest(page, '2:02')
  expect(personalRequests).toBe(2)

  failPersonal = true
  failLeaderboard = true
  await page.getByRole('button', { name: 'daily', exact: true }).click()
  await expect(page.getByText('Could not load times.', { exact: true })).toBeVisible()
  await expectBest(page, '1:01')
  failLeaderboard = false
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByText('daily leader', { exact: true })).toBeVisible()
  await expectBest(page, '1:01')
  expect(personalRequests).toBe(3)
})

test('personal-best retry recovers independently without hiding a successful leaderboard', async ({ page }) => {
  let fail = true
  await page.route('**/api/solo/personal_bests', route => route.fulfill({ status: fail ? 503 : 200, json: fail ? {} : personalBests() }))
  await page.route('**/api/solo/leaderboard?*', route => route.fulfill({ json: { entries: [entry('daily leader')] } }))
  await page.goto('/')
  await expect(page.getByText('daily leader', { exact: true })).toBeVisible()
  await expect(page.getByText('Could not load your best times.', { exact: true })).toBeVisible()
  fail = false
  await page.getByRole('button', { name: 'Retry your best times', exact: true }).click()
  await expectBest(page, '1:01')
  await expect(page.getByText('daily leader', { exact: true })).toBeVisible()
  await expect(page.getByText('Could not load your best times.', { exact: true })).toHaveCount(0)
})

test('remount refreshes personal bests and ignores an abandoned mount response', async ({ page }) => {
  const abandoned = deferred()
  const abandonedFinished = deferred()
  let personalRequests = 0
  await page.route('**/api/solo/personal_bests', async route => {
    personalRequests++
    const first = personalRequests === 1
    if (first) await abandoned.promise
    await route.fulfill({ json: { daily: entry(first ? 'old best' : 'new best', first ? 61000 : 244000) } })
    if (first) abandonedFinished.resolve()
  })
  await page.route('**/api/solo/leaderboard?*', route => route.fulfill({ json: { entries: [entry('daily leader')] } }))

  await page.goto('/')
  await expect(page.getByText('daily leader', { exact: true })).toBeVisible()
  await expect.poll(() => personalRequests).toBe(1)
  await page.getByRole('button', { name: 'Multiplayer', exact: true }).click()
  await expect(page).toHaveURL(/\/m$/)
  await page.getByRole('button', { name: 'Solo', exact: true }).click()
  await expectBest(page, '4:04')
  expect(personalRequests).toBe(2)
  abandoned.resolve()
  await abandonedFinished.promise
  await expectBest(page, '4:04')
})

test('successful submission refreshes cached personal bests and the selected leaderboard', async ({ page }) => {
  let personalRequests = 0
  let leaderboardRequests = 0
  let submissions = 0
  await page.route('**/api/solo/personal_bests', route => {
    personalRequests++
    return route.fulfill({ json: submissions ? { daily: entry('submitted best', 31000) } : personalBests() })
  })
  await page.route('**/api/solo/leaderboard?*', route => {
    leaderboardRequests++
    return route.fulfill({ json: { entries: [entry(submissions ? 'submitted leader' : 'daily leader')] } })
  })
  await page.route('**/api/solo/scores', route => {
    submissions++
    return route.fulfill({ json: { ok: true, is_personal_best: { daily: true } } })
  })

  await page.goto('/')
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key)!)
    Object.assign(state, { board: [1, 2, 3], deck: [], events: [], recentClaims: [], elapsedMs: 31000, startedAtMs: Date.now() - 31000 })
    localStorage.setItem(key, JSON.stringify(state))
  }, SAVE_KEY)
  await page.reload()
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  await expect(page.getByText('daily leader', { exact: true })).toBeVisible()
  await expectBest(page, '1:01')
  const previousPersonalRequests = personalRequests
  const previousLeaderboardRequests = leaderboardRequests
  for (const id of [1, 2, 3]) await page.locator(`[data-card-id="${id}"]`).click()
  await expect(page.getByText('submitted leader', { exact: true })).toBeVisible()
  await expectBest(page, '0:31')
  expect(submissions).toBe(1)
  expect(personalRequests).toBe(previousPersonalRequests + 1)
  expect(leaderboardRequests).toBe(previousLeaderboardRequests + 1)
})
