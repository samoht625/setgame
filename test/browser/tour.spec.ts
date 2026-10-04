import { test, expect, type Page } from '@playwright/test'
import { isSet } from '../../app/javascript/lib/rules'

type Event = [string, Record<string, unknown> | undefined]

// A first visit: nothing in storage, unlike the other specs.
test.use({ storageState: { cookies: [], origins: [] } })

async function recordEvents(page: Page): Promise<Event[]> {
  const events: Event[] = []
  await page.exposeFunction('__recordUmami', (name: string, data?: Record<string, unknown>) => { events.push([name, data]) })
  await page.addInitScript(() => {
    const record = (window as unknown as { __recordUmami: (name: string, data?: unknown) => void }).__recordUmami
    window.umami = { track: (name, data) => record(name, data) }
  })
  return events
}

const names = (events: Event[]) => events.map(([name]) => name).filter(name => name.startsWith('tour_'))

async function demoCards(scope: ReturnType<Page['locator']>) {
  return scope.locator('[data-demo-card]').evaluateAll(nodes => nodes.map(node => ({
    id: Number(node.getAttribute('data-demo-card')),
    inSet: node.getAttribute('data-in-set') === 'true'
  })))
}

test('the first visit shows a two-step rules tour before the deal, then never again', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const events = await recordEvents(page)
  await page.goto('/')

  const tour = page.getByRole('dialog', { name: 'Every card has 4 features' })
  await expect(tour).toBeVisible()
  await expect(tour.locator('[data-demo-card]')).toHaveCount(6)
  // The deal, and its clock, wait for the tour.
  await page.waitForTimeout(500)
  await expect(page.locator('[data-card-id]')).toHaveCount(0)

  await tour.getByRole('button', { name: 'Next', exact: true }).click()
  const rule = page.getByRole('dialog', { name: /all same or all different/ })
  await expect(rule.locator('[data-revealed="true"]')).toBeVisible()
  const shown = await demoCards(rule)
  const lit = shown.filter(card => card.inSet).map(card => card.id)
  expect(lit).toHaveLength(3)
  expect(isSet(...lit as [number, number, number])).toBe(true)
  // The other three cards don't make a second set with anything on the mini board.
  const ids = shown.map(card => card.id)
  let sets = 0
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) for (let k = j + 1; k < 6; k++) if (isSet(ids[i]!, ids[j]!, ids[k]!)) sets++
  expect(sets).toBe(1)
  await expect(rule.getByRole('listitem')).toHaveText([/Number.*all different/, /Color.*same/, /Shape.*all different/, /Shading.*all different/])

  await rule.getByRole('button', { name: 'Got it', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-card-id]').first()).toBeVisible()
  expect(names(events)).toEqual(['tour_start', 'tour_complete'])

  await page.reload()
  await expect(page.locator('[data-card-id]').first()).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(names(events)).toEqual(['tour_start', 'tour_complete'])
  expect(errors).toEqual([])
})

test('the tour is modal, and skipping it is remembered too', async ({ page }) => {
  const events = await recordEvents(page)
  await page.goto('/daily')
  await expect(page.getByRole('dialog', { name: 'Every card has 4 features' })).toBeVisible()
  // The page behind is inert: the daily's Start can't even take focus from under the tour.
  const start = page.getByRole('button', { name: 'Start', exact: true })
  expect(await start.evaluate(node => { (node as HTMLElement).focus(); return document.activeElement === node })).toBe(false)
  // Tabbing never lands on the page behind (it may step out to the browser's own UI, as native modals do).
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement === document.body || Boolean(document.activeElement?.closest('dialog')))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  expect(events.filter(([name]) => name.startsWith('tour_'))).toEqual([['tour_start', undefined], ['tour_skip', { step: 1 }]])
  await page.reload()
  await expect(page.getByText('Same deal for everyone today.')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('Skip closes the tour and deals', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('[data-card-id]').first()).toBeVisible()
})

test('players from before the tour don’t see it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('setgame_player_id', '11111111-2222-4333-8444-555555555555'))
  await page.goto('/')
  await expect(page.locator('[data-card-id]').first()).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('How to play opens from the header menu, leads with the example set and keeps the full rules in the page', async ({ page, request }) => {
  const html = await (await request.get('/')).text()
  expect(html).toContain('Three cards are a set when each feature is either the same on all three cards or different on all three.')
  expect(html).toContain('Fan site, not affiliated with Set Enterprises.')

  await page.addInitScript(() => localStorage.setItem('setgame_tour_v1', 'done'))
  await page.goto('/')
  // The rules aren't spelled out on the page itself any more.
  await expect(page.getByText('Three cards are a set when each feature', { exact: false })).toBeHidden()
  await expect(page.getByText('Fan site, not affiliated with Set Enterprises.')).toBeVisible()

  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'How to play', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'How to play' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-revealed="true"]')).toBeVisible()
  await expect(dialog.getByText('Find 3 cards: each feature all same or all different.')).toBeVisible()
  await expect(dialog.getByText('Three cards are a set when each feature', { exact: false })).toBeHidden()
  await dialog.getByText('Full rules').click()
  await expect(dialog.getByText('Three cards are a set when each feature', { exact: false })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true })

  test('the tour and How to play fit a small screen', async ({ page }) => {
    await page.goto('/')
    const tour = page.getByRole('dialog', { name: 'Every card has 4 features' })
    await expect(tour.getByRole('button', { name: 'Next', exact: true })).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await tour.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Got it', exact: true })).toBeInViewport({ ratio: 1 })
    await page.getByRole('button', { name: 'Got it', exact: true }).click()

    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await page.getByRole('menuitem', { name: 'How to play', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'How to play' })
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
