import { test, expect, type Page } from '@playwright/test'
import { routeBootStatus } from './players'

// Switching between the Puzzle and the Daily Deal in the header swaps what's
// in the page, and nothing the two share may move: the header, the card each
// shows before and after a run, the card's title and, on the result cards,
// everything down to the leaderboard.

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  phone: { width: 390, height: 844 }
}

/** What both games have on screen, whatever state each is in. */
const SHARED = {
  header: 'header > div',
  logo: 'header > div > :first-child',
  modes: 'header nav[aria-label="Game mode"]',
  puzzleTab: 'header nav[aria-label="Game mode"] a:nth-of-type(1)',
  dailyTab: 'header nav[aria-label="Game mode"] a:nth-of-type(2)',
  menu: 'header button[aria-label="Menu"]'
}
/** The start card or the result card. Their heights differ: a result has a leaderboard under it. */
const CARD = { card: '[data-game-card]', title: '[data-card-title]' }
/** What the two result cards share under the time. */
const RESULT = {
  streak: '[data-game-card] [data-streak]',
  actions: '[data-game-card] a[href]',
  standings: '[data-game-card] > div:nth-of-type(2)',
  entries: '[data-game-card] ol'
}
const BOARD = { board: 'main [aria-busy]' }
/** What two games in progress share: the clock's place, and the board's place and width. Its height is the deal's. */
const PLAY = { ...BOARD, timer: '[role="timer"]' }
const PLAY_SIDES = { board: 3, timer: 2 }
const FOUND_SETS = 'ol[aria-label="Sets found"]'

type Box = [number, number, number, number]
type Boxes = Record<string, Box | null>
type Frame = { path: string; boxes: Boxes }
type Recording = { frames: Frame[]; shift: number }
type State = 'new' | 'finished'
type Kind = 'puzzle' | 'daily'

const TABS: Record<Kind, string> = { puzzle: 'Puzzle', daily: 'Daily Deal' }

// The server's own status for this player, with today's try finished on top of it.
function finished(kind: Kind, status: Record<string, unknown>) {
  const elapsed = kind === 'puzzle' ? 38_000 : 214_000
  const others = kind === 'puzzle' ? [21_000, 25_000] : [185_000, 202_000, 230_000, 251_000]
  const entry = (elapsed_ms: number, index: number) => ({
    player_id: `00000000-0000-4000-8000-00000000000${index}`, display_name: `Player ${index}`, elapsed_ms, completed_at: new Date().toISOString(), misses: 0
  })
  return {
    ...status,
    total: others.length + 1,
    leaderboard: [...others, elapsed].sort((a, b) => a - b).map(entry),
    me: {
      attempted: true,
      streak: 3,
      result: {
        display_name: null, elapsed_ms: elapsed, misses: 1, rank: 3, total: others.length + 1, share_token: 'token', replay: false, streak: 3,
        // One row of squares on the Puzzle's card, three on the Daily Deal's.
        marks: kind === 'puzzle' ? 'hhmhhhh' : 'ggygyyrggyggyrgyggygygrgy'
      }
    }
  }
}

async function finish(page: Page, kind: Kind) {
  await routeBootStatus(page, kind, status => finished(kind, status))
}

/** Starts sampling the boxes of `selectors` on every frame, and the browser's own layout-shift entries. */
async function record(page: Page, selectors: Record<string, string>) {
  await page.evaluate(selectors => {
    const state = { frames: [] as Frame[], shift: 0, done: false }
    ;(window as unknown as { __switch: typeof state }).__switch = state
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) state.shift += (entry as unknown as { value: number }).value
    }).observe({ type: 'layout-shift' })
    const sample = () => {
      if (state.done) return
      const boxes: Boxes = {}
      for (const [name, selector] of Object.entries(selectors)) {
        const element = document.querySelector(selector)
        const rect = element?.getBoundingClientRect()
        const shown = element && rect && rect.width > 0 && getComputedStyle(element).visibility !== 'hidden'
        boxes[name] = shown ? [rect.x, rect.y, rect.width, rect.height] : null
      }
      state.frames.push({ path: location.pathname, boxes })
      requestAnimationFrame(sample)
    }
    sample()
  }, selectors)
}

async function stop(page: Page): Promise<Recording> {
  return page.evaluate(() => {
    const state = (window as unknown as { __switch: Recording & { done: boolean } }).__switch
    state.done = true
    return { frames: state.frames, shift: state.shift }
  })
}

async function open(page: Page, kind: Kind, state: State | 'started') {
  await page.getByRole('navigation', { name: 'Game mode' }).getByRole('link', { name: TABS[kind], exact: true }).click()
  // A deal without a set in it has more than twelve cards.
  if (state === 'started') await expect(page.locator('[data-card-id]').nth(11)).toBeVisible()
  else await expect(page.locator(`[data-game-card="${state === 'new' ? 'start' : 'result'}"]`)).toBeVisible()
}

/**
 * Switches to `kind` and holds the page to it: every box in `selectors` is
 * where it was before the click from the first frame of the new page on, in
 * `sides` of it (x, y, width, height), and the browser reports no layout shift.
 */
async function expectSteadySwitch(page: Page, kind: Kind, state: State | 'started', selectors: Record<string, string>, sides: Record<string, number> = {}) {
  await record(page, selectors)
  const path = new URL(page.url()).pathname
  await open(page, kind, state)
  // Long enough for anything late (a fetch, an animation) to have moved something.
  await page.waitForTimeout(600)
  const { frames, shift } = await stop(page)
  const before = frames[0]!
  const after = frames.filter(frame => frame.path !== path)
  expect(before.path).toBe(path)
  expect(after.length).toBeGreaterThan(5)
  for (const name of Object.keys(selectors)) {
    const from = before.boxes[name]
    expect(from, `${name} is on the page before the switch`).not.toBeNull()
    for (const [index, frame] of after.entries()) {
      const to = frame.boxes[name]
      expect(to, `${name} is on the page in frame ${index} after the switch`).not.toBeNull()
      for (let side = 0; side < (sides[name] ?? 4); side++) {
        expect(Math.abs(to![side]! - from![side]!), `${name} ${['x', 'y', 'width', 'height'][side]} in frame ${index} after the switch to ${TABS[kind]}: ${from![side]} -> ${to![side]}`).toBeLessThan(0.5)
      }
    }
  }
  expect(shift).toBe(0)
}

test.beforeEach(async ({ page }) => {
  // The result card's one-time sheets (a reminder, the home screen) would cover the switch.
  await page.addInitScript(() => {
    localStorage.setItem('setgame_reminder_prompt_v1', JSON.stringify({ dismissals: 3 }))
    localStorage.setItem('setgame_install_prompt_v1', JSON.stringify({ done: true }))
  })
})

for (const [width, viewport] of Object.entries(VIEWPORTS)) {
  const states: [State, State][] = [['new', 'new'], ['finished', 'new'], ['new', 'finished'], ['finished', 'finished']]
  for (const [puzzle, daily] of states) {
    test(`nothing shared moves between a ${puzzle} Puzzle and a ${daily} Daily Deal on a ${width}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      if (puzzle === 'finished') await finish(page, 'puzzle')
      if (daily === 'finished') await finish(page, 'daily')
      await page.goto('/')
      // Each game once, so both have their status from here on, as they do after a first load.
      await open(page, 'daily', daily)
      await open(page, 'puzzle', puzzle)

      // The card's height is its own: a result card has a leaderboard under the result.
      const selectors = { ...SHARED, ...CARD, ...(puzzle === 'finished' && daily === 'finished' ? RESULT : {}) }
      const sides = { card: 3, entries: 3, standings: 3 }
      await expectSteadySwitch(page, 'daily', daily, selectors, sides)
      await expectSteadySwitch(page, 'puzzle', puzzle, selectors, sides)
    })
  }

  test(`the first load of each game paints it where it stays on a ${width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.addInitScript(() => {
      const state = { shift: 0 }
      ;(window as unknown as { __load: typeof state }).__load = state
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) state.shift += (entry as unknown as { value: number }).value
      }).observe({ type: 'layout-shift', buffered: true })
    })
    for (const path of ['/', '/daily']) {
      await page.goto(path)
      await expect(page.locator('[data-game-card="start"]')).toBeVisible()
      const first = await page.locator('[data-game-card]').boundingBox()
      await page.waitForTimeout(800)
      expect(await page.locator('[data-game-card]').boundingBox()).toEqual(first)
      expect(await page.evaluate(() => (window as unknown as { __load: { shift: number } }).__load.shift)).toBe(0)
    }
  })
}

test('a game in progress keeps its board where the other game’s backdrop is, on a phone', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]')).toHaveCount(12)
  // The strip over the board is the run's: before one, the start card says which game this is.
  await expect(page.getByRole('timer')).toBeVisible()

  await expectSteadySwitch(page, 'daily', 'new', { ...SHARED, ...BOARD })
  await expect(page.getByRole('timer')).toHaveCount(0)
  await expectSteadySwitch(page, 'puzzle', 'started', { ...SHARED, ...BOARD })

  // The Daily Deal's own board lands where its backdrop was. (A deal without a set in it gets a fifth row.)
  await open(page, 'daily', 'new')
  const backdrop = await page.locator(BOARD.board).boundingBox()
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]').first()).toBeVisible()
  const dealt = await page.locator(BOARD.board).boundingBox()
  for (const side of ['x', 'y', 'width'] as const) expect(Math.abs(dealt![side] - backdrop![side])).toBeLessThan(0.5)
  if (await page.locator('[data-card-id]').count() === 12) expect(Math.abs(dealt!.height - backdrop!.height)).toBeLessThan(0.5)
})

async function start(page: Page) {
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]').nth(11)).toBeVisible()
}

/** Whether the cards on the board skipped their deal-in, read from the first card. */
const dealtAlready = (page: Page) =>
  page.locator('[data-card-id]').first().evaluate(card => getComputedStyle(card).animationDelay.startsWith('-'))

for (const [width, viewport] of Object.entries({ desktop: VIEWPORTS.desktop, 'wide desktop': { width: 1600, height: 1000 } })) {
  test(`two games in progress have their boards in one place on a ${width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await start(page)
    expect(await dealtAlready(page)).toBe(false)
    await open(page, 'daily', 'new')
    await start(page)
    expect(await dealtAlready(page)).toBe(false)

    await expectSteadySwitch(page, 'puzzle', 'started', { ...SHARED, ...PLAY }, PLAY_SIDES)
    // Cards that were dealt before are just there when the game is picked up again.
    expect(await dealtAlready(page)).toBe(true)
    // The Puzzle's found sets go under its board, so they don't push it aside.
    const board = (await page.locator(BOARD.board).boundingBox())!
    const sets = (await page.locator(FOUND_SETS).boundingBox())!
    expect(sets.y).toBeGreaterThanOrEqual(board.y + board.height)
    expect(Math.abs(sets.x - board.x)).toBeLessThan(0.5)
    expect(Math.abs(sets.width - board.width)).toBeLessThan(0.5)

    await expectSteadySwitch(page, 'daily', 'started', { ...SHARED, ...PLAY }, PLAY_SIDES)
    expect(await dealtAlready(page)).toBe(true)
  })
}

test('on a phone the Puzzle’s board fills the width, with its found sets in two columns under it', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.phone)
  await page.goto('/')
  await start(page)
  const board = (await page.locator(BOARD.board).boundingBox())!
  expect(board.x).toBe(12)
  const main = (await page.locator('main').boundingBox())!
  expect(board.width).toBe(main.width - 24)
  const slots = await page.locator(`${FOUND_SETS} > li`).evaluateAll(items => items.map(item => { const { x, y } = item.getBoundingClientRect(); return { x, y } }))
  expect(slots).toHaveLength(6)
  expect(slots[0]!.x).toBe(board.x)
  expect(slots[0]!.y).toBeGreaterThanOrEqual(board.y + board.height)
  expect(slots[1]!.y).toBe(slots[0]!.y)
  expect(slots[2]!.x).toBe(slots[0]!.x)
  expect(slots[2]!.y).toBeGreaterThan(slots[0]!.y)
})

test('wide screens show the start card alone, and the leaderboard column holds still', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop)
  await page.addInitScript(() => localStorage.setItem('setgame_panel_open', '1'))
  await page.goto('/')
  await expect(page.locator('[data-game-card="start"]')).toBeVisible()
  // No board behind the start card here: the card stands where the result card will.
  await expect(page.locator(BOARD.board)).toBeHidden()
  await expect(page.getByRole('complementary', { name: 'Leaderboard' })).toBeVisible()

  const selectors = { ...SHARED, ...CARD, panel: 'main aside' }
  await expectSteadySwitch(page, 'daily', 'new', selectors, { panel: 3 })
  await expectSteadySwitch(page, 'puzzle', 'new', selectors, { panel: 3 })
})
