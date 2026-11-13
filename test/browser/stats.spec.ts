import { test, expect, type Locator, type Page } from '@playwright/test'
import { isSet } from '../../app/javascript/lib/rules'
import { applySoloClaim, isRoundOver, startSoloDeal } from '../../app/javascript/lib/solo_deal'
import { mintPlayers } from './players'

/** Plays the deal out, taking the first set each turn, with the last claim landing at `finishMs`. */
function playOut(seed: number, finishMs: number) {
  const deal = startSoloDeal(seed)
  const picks: number[][] = []
  while (!isRoundOver(deal)) {
    const b = deal.board
    let found: number[] | null = null
    for (let i = 0; i < b.length && !found; i++) for (let j = i + 1; j < b.length && !found; j++) for (let k = j + 1; k < b.length && !found; k++) {
      if (isSet(b[i]!, b[j]!, b[k]!)) found = [b[i]!, b[j]!, b[k]!].sort((x, y) => x - y)
    }
    applySoloClaim(deal, found!)
    picks.push(found!)
  }
  return picks.map((cards, index) => ({ type: 'claim', cards, t_ms: Math.round(((index + 1) / picks.length) * finishMs) }))
}

/** The players table only lists named finishers: on an empty database, finish one Practice game under a name. */
async function ensureNamedFinisher(page: Page, baseURL: string) {
  await page.goto('/stats')
  if (await page.locator('table.players').count()) return

  const [headers] = await mintPlayers(baseURL, 1)
  const start = await (await page.request.post('/api/solo/games', { headers: headers! })).json()
  // The server refuses runs under 30 seconds of wall clock.
  await page.waitForTimeout(31_000)
  const events = playOut(start.seed, 30_500)
  const res = await page.request.post('/api/solo/scores', {
    headers: headers!,
    data: { game_id: start.game_id, elapsed_ms: events[events.length - 1]!.t_ms, events, misses: 0, display_name: `Stat ${Math.floor(Math.random() * 9000 + 1000)}` }
  })
  expect(res.status(), await res.text()).toBe(200)
  await page.goto('/stats')
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const box = async (locator: Locator) => (await locator.boundingBox())!

test('the stats page is a compact table on desktop and two-line rows on a phone, with nothing spilling sideways', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await ensureNamedFinisher(page, baseURL!)

  await expect(page.getByRole('heading', { level: 1, name: 'Stats' })).toBeVisible()
  const table = page.getByRole('table', { name: 'Most games finished' })
  await expect(table.getByRole('columnheader')).toHaveText(['Rank', 'Player', 'Games', 'Practice', 'Daily Deal', 'Best Daily Deal', 'Best Puzzle'])
  const rows = table.locator('tbody tr')
  const count = await rows.count()
  expect(count).toBeGreaterThan(0)
  expect(count).toBeLessThanOrEqual(10)
  await expect(rows.first().getByRole('rowheader')).toBeVisible()
  await expect(rows.first().getByRole('cell')).toHaveCount(6)

  // Desktop: one line per player, every number in its own right-aligned column under its heading.
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  const columns = ['total', 'prac', 'dly', 'bdd', 'bpz']
  for (const column of columns) {
    const heading = await box(table.locator(`thead .${column}`))
    for (let i = 0; i < count; i++) {
      const cell = await box(rows.nth(i).locator(`.${column}`))
      expect(Math.abs(cell.x + cell.width - (heading.x + heading.width)), `${column} in row ${i + 1} lines up with its heading`).toBeLessThanOrEqual(1)
    }
  }
  for (let i = 0; i < count; i++) {
    const row = await box(rows.nth(i))
    expect(row.height, `row ${i + 1} is one compact line`).toBeLessThanOrEqual(48)
  }
  expect(await rows.first().locator('.total').evaluate(el => getComputedStyle(el).fontVariantNumeric)).toContain('tabular-nums')
  const most = await box(page.getByRole('heading', { name: 'Most found' }))
  const least = await box(page.getByRole('heading', { name: 'Least found' }))
  expect(Math.abs(most.y - least.y), 'the ranked sets sit side by side on a wide screen').toBeLessThanOrEqual(1)
  expect(least.x).toBeGreaterThan(most.x + 200)

  // The Per day chart switches between games and players without a script.
  await expect(page.locator('[data-series=games]')).toBeVisible()
  await page.locator('label[for=act-players]').click()
  await expect(page.locator('[data-series=players]')).toBeVisible()
  await expect(page.locator('[data-series=games]')).toBeHidden()

  // Phone: the name, games and best times share the first line; the practice and daily split sits under the name.
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  const card = await box(table)
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i)
    const name = await box(row.locator('.who'))
    const total = await box(row.locator('.total'))
    const practice = await box(row.locator('.prac'))
    const daily = await box(row.locator('.dly'))
    const bestPuzzle = await box(row.locator('.bpz'))
    expect(name.height, `name ${i + 1} stays on one line`).toBeLessThan(26)
    expect(Math.abs(name.y + name.height / 2 - (total.y + total.height / 2))).toBeLessThanOrEqual(3)
    expect(name.x + name.width).toBeLessThanOrEqual(total.x + 1)
    expect(practice.y).toBeGreaterThanOrEqual(name.y + name.height - 2)
    expect(Math.abs(practice.y - daily.y)).toBeLessThanOrEqual(1)
    expect(daily.x).toBeGreaterThanOrEqual(practice.x + practice.width)
    expect(bestPuzzle.x + bestPuzzle.width).toBeLessThanOrEqual(card.x + card.width)
    expect((await box(row)).height, `row ${i + 1} is two short lines, not a card`).toBeLessThanOrEqual(64)
  }
  expect(await rows.first().locator('.prac').evaluate(el => getComputedStyle(el, '::after').content)).toBe('" practice"')
  expect(await rows.first().locator('.dly').evaluate(el => getComputedStyle(el, '::after').content)).toBe('" daily"')
  // The split's column headings leave the phone layout but stay in the table for screen readers.
  await expect(table.getByRole('columnheader')).toHaveCount(7)
  expect((await box(table.locator('thead .prac'))).width).toBeLessThanOrEqual(1)

  await page.setViewportSize({ width: 320, height: 640 })
  expect(await overflow(page), 'nothing spills sideways on the narrowest phones').toBeLessThanOrEqual(0)
})

test('the stats page follows the dark theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/stats')
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(17, 18, 20)')
  expect(await page.locator('.tiles > div').first().evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(23, 23, 23)')
  await page.emulateMedia({ colorScheme: 'light' })
  expect(await page.locator('.tiles > div').first().evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)')
})
