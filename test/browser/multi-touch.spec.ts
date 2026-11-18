import { test, expect, type CDPSession, type Page } from '@playwright/test'
import { isSet, thirdCard } from '../../app/javascript/lib/rules'
import { playAsNewPlayer } from './players'

// Two thumbs on two cards at once. A browser makes no click out of a touch
// that shared the screen with another finger, so the board picks a card when
// its finger lifts (see Board.tsx). These specs put real fingers on the
// screen through the DevTools protocol, which is Chromium's: Playwright's own
// tap() is one finger at a time.
//
// A finger on a card never pinches the page, wherever the other finger is, so
// two thumbs that slide as they press can't zoom it. Off the cards the page
// pinches as it always did. Chromium goes by the cards' touch-action. Safari
// may not, so there the board cancels touch events as well: the pinching
// specs run a second time with Safari's gesture events made up and the
// cards' touch-action taken away, which leaves only that to hold.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

type Point = { x: number; y: number }
type Finger = Point & { id: number; card: number | null }

const card = (page: Page, id: number) => page.locator(`[data-card-id="${id}"]`)

async function cards(page: Page): Promise<number[]> {
  return page.locator('[data-card-id]').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-card-id'))))
}

async function picked(page: Page): Promise<number[]> {
  return page.locator('[data-card-id][aria-pressed="true"]').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-card-id'))))
}

async function middle(page: Page, id: number): Promise<Point> {
  const box = (await card(page, id).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** The middle of the gap between two cards that sit side by side. */
async function gapBetween(page: Page, left: number, right: number): Promise<Point> {
  const [a, b] = [(await card(page, left).boundingBox())!, (await card(page, right).boundingBox())!]
  return { x: (a.x + a.width + b.x) / 2, y: a.y + a.height / 2 }
}

/** A point on the page above the board, well clear of the cards. */
async function aboveBoard(page: Page, x: number): Promise<Point> {
  const top = (await card(page, (await cards(page))[0]!).boundingBox())!.y
  return { x, y: top - 30 }
}

const isOnCard = (page: Page, point: Point) =>
  page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-card-id]') != null, point)

const zoom = (page: Page) => page.evaluate(() => window.visualViewport!.scale)

/** The page has had time to zoom, and hasn't. */
async function expectNoZoom(page: Page) {
  await page.waitForTimeout(300)
  expect(await zoom(page)).toBe(1)
}

async function expectPicked(page: Page, ids: number[]) {
  await expect.poll(async () => (await picked(page)).sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b))
}

function findTriple(board: number[], valid: boolean): number[] {
  for (let i = 0; i < board.length; i++)
    for (let j = i + 1; j < board.length; j++)
      for (let k = j + 1; k < board.length; k++)
        if (isSet(board[i]!, board[j]!, board[k]!) === valid) return [board[i]!, board[j]!, board[k]!]
  throw new Error(`No ${valid ? 'valid' : 'invalid'} triple on the board`)
}

/** Two cards whose third card is on the board too. */
function completePair(board: number[]): [number, number] {
  const [a, b] = findTriple(board, true)
  return [a!, b!]
}

/** The fingers on the screen. Each call is one instant: every finger it names lands, moves or lifts together. */
class Fingers {
  private down: Finger[] = []
  private nextId = 0
  // The time each event says it happened, in seconds. A drag steps it on by a
  // frame per move whatever the machine's pace, so a flick always carries the
  // same speed and leaves the page gliding the same way.
  private clock = 0

  private constructor(private page: Page, private cdp: CDPSession) {}

  static async on(page: Page): Promise<Fingers> {
    return new Fingers(page, await page.context().newCDPSession(page))
  }

  // touchStart and touchMove take every finger now down; touchEnd takes the ones lifting, or none for all of them.
  private send(type: 'touchStart' | 'touchMove' | 'touchEnd', fingers: Finger[] = this.down, later = 0.001) {
    this.clock = Math.max(this.clock + later, Date.now() / 1000)
    return this.cdp.send('Input.dispatchTouchEvent', { type, timestamp: this.clock, touchPoints: fingers.map(({ id, x, y }) => ({ id, x, y })) })
  }

  /** A finger lands on the middle of each card named, or on the point given. */
  async press(...targets: Array<number | Point>) {
    for (const target of targets) {
      const onCard = typeof target === 'number'
      const { x, y } = onCard ? await middle(this.page, target) : target
      this.down.push({ id: this.nextId++, card: onCard ? target : null, x: Math.round(x), y: Math.round(y) })
    }
    await this.send('touchStart')
  }

  /** The fingers on these cards lift; with no cards named, every finger does. */
  async lift(...ids: number[]) {
    const lifting = this.down.filter(finger => ids.includes(finger.card))
    this.down = ids.length ? this.down.filter(finger => !ids.includes(finger.card)) : []
    await this.send('touchEnd', lifting)
  }

  /** Each finger slides by its own offset, a frame at a time. */
  async drag(offsets: Array<{ dx: number; dy: number }>, steps = 8) {
    const from = this.down.map(({ x, y }) => ({ x, y }))
    for (let step = 1; step <= steps; step++) {
      this.down.forEach((finger, index) => {
        finger.x = Math.round(from[index]!.x + (offsets[index]!.dx * step) / steps)
        finger.y = Math.round(from[index]!.y + (offsets[index]!.dy * step) / steps)
      })
      await this.send('touchMove', this.down, 0.016)
    }
  }

  /** Press and lift at once. */
  async tap(...ids: number[]) {
    await this.press(...ids)
    await this.lift()
  }
}

async function ready(page: Page) {
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
}

async function playAs(page: Page, name: string) {
  const id = await playAsNewPlayer(page)
  await page.addInitScript(([id, name]) => localStorage.setItem(`setgame_player_name:${id}`, name!), [id, name])
}

const GAMES: Array<{ name: string; open: (page: Page) => Promise<void> }> = [
  { name: 'Practice', open: async page => { await page.goto('/practice') } },
  {
    name: 'the Puzzle',
    open: async page => {
      await page.goto('/puzzle')
      await page.getByRole('button', { name: 'Start', exact: true }).click()
    }
  },
  {
    name: 'the Daily Deal',
    open: async page => {
      await page.goto('/daily')
      await page.getByRole('button', { name: 'Start', exact: true }).click()
    }
  },
  { name: 'Multiplayer', open: async page => { await page.goto('/m') } },
  {
    // Puzzle #1 closed long ago on any clock (see archive.spec.ts).
    name: 'a past Puzzle from the archive',
    open: async page => {
      await page.goto('/puzzle/1')
      await page.getByRole('button', { name: 'Start practice', exact: true }).click()
    }
  }
]

for (const game of GAMES) {
  test(`${game.name}: two cards pressed at the same moment are both picked, and both unpicked the same way`, async ({ page }) => {
    await playAsNewPlayer(page)
    await game.open(page)
    await ready(page)
    const fingers = await Fingers.on(page)
    const [a, b] = await cards(page)

    await fingers.tap(a!, b!)
    await expectPicked(page, [a!, b!])

    await fingers.tap(a!, b!)
    await expectPicked(page, [])
  })
}

test('fingers that overlap in time each pick their own card as they lift', async ({ page }) => {
  await playAsNewPlayer(page)
  await page.goto('/practice')
  await ready(page)
  const fingers = await Fingers.on(page)
  const [a, b] = await cards(page)

  // One thumb lands, the other lands before the first lifts.
  await fingers.press(a!)
  await fingers.press(b!)
  await expectPicked(page, [])
  await fingers.lift(a!)
  await expectPicked(page, [a!])
  await fingers.lift(b!)
  await expectPicked(page, [a!, b!])

  // And lifting in the other order.
  await fingers.press(a!)
  await fingers.press(b!)
  await fingers.lift(b!)
  await expectPicked(page, [a!])
  await fingers.lift(a!)
  await expectPicked(page, [])
})

test('three cards pressed at once are claimed as a set, or count as one miss', async ({ page }) => {
  await playAsNewPlayer(page)
  await page.goto('/practice')
  await ready(page)
  const fingers = await Fingers.on(page)

  const board = await cards(page)
  await fingers.tap(...findTriple(board, false))
  await expect(page.getByRole('status')).toContainText('Not a valid set')
  await expectPicked(page, [])
  expect(await cards(page)).toEqual(board)

  const set = findTriple(board, true)
  await fingers.tap(...set)
  await expect(page.getByRole('status')).toContainText('Set found!')
  for (const id of set) await expect(card(page, id)).toHaveCount(0)
  await expectPicked(page, [])
})

test('two-card sets: a pair pressed at once finds its set, and a finger during the reveal picks nothing', async ({ page }) => {
  await playAs(page, 'Yaniv')
  await page.goto('/practice')
  await ready(page)
  const fingers = await Fingers.on(page)
  const board = await cards(page)
  const [a, b] = completePair(board)
  const third = thirdCard(a, b)!
  const other = board.find(id => ![a, b, third].includes(id))!

  await fingers.tap(a, b)
  await expect(page.locator('[data-completed]')).toHaveCount(3)
  await expect(card(page, third)).toHaveAttribute('data-completed', 'filled')
  await fingers.tap(other)
  await expect(page.getByRole('status')).toContainText('Set found!')
  await expect(page.locator('[data-completed]')).toHaveCount(0)
  await expect(card(page, a)).toHaveCount(0)
  await expect(card(page, other)).toHaveAttribute('aria-pressed', 'false')
})

test('two-card sets in Multiplayer: a pair pressed at once is one claim, and the server completes it', async ({ page }) => {
  await playAs(page, 'Tido')
  await page.goto('/m')
  await ready(page)
  await expect(page.getByText('Tido').first()).toBeVisible()
  const fingers = await Fingers.on(page)
  const [a, b] = completePair(await cards(page))

  await fingers.tap(a, b)
  await expect(card(page, thirdCard(a, b)!)).toHaveAttribute('data-completed', 'filled')
  await expect(page.getByText('You found a set!')).toBeVisible()
})

test.describe('one finger', () => {
  // The finger that stops a glide is aimed at a moving card, and about one time in a hundred misses it.
  test.describe.configure({ retries: 2 })

  /** Counts every time the card goes from picked to unpicked or back. */
  async function countFlips(page: Page, id: number) {
    await card(page, id).evaluate(node => {
      const counter = window as unknown as { cardFlips: number }
      counter.cardFlips = 0
      new MutationObserver(records => { counter.cardFlips += records.length }).observe(node, { attributes: true, attributeFilter: ['aria-pressed'] })
    })
    return () => page.evaluate(() => (window as unknown as { cardFlips: number }).cardFlips)
  }

  test('a tap picks its card once, and a second tap unpicks it', async ({ page }) => {
    await playAsNewPlayer(page)
    await page.goto('/practice')
    await ready(page)
    const fingers = await Fingers.on(page)
    const [a] = await cards(page)
    const flips = await countFlips(page, a!)

    await fingers.tap(a!)
    await expectPicked(page, [a!])
    // The browser's click for the tap has come and gone by now.
    await page.waitForTimeout(500)
    await expectPicked(page, [a!])
    expect(await flips()).toBe(1)

    // Playwright's own tap, straight after.
    await card(page, a!).tap()
    await expectPicked(page, [])
    await page.waitForTimeout(500)
    await expectPicked(page, [])
    expect(await flips()).toBe(2)
  })

  test('the click a browser sends after a tap is dropped even when it doesn’t say it came from touch, as in Safari', async ({ page }) => {
    await playAsNewPlayer(page)
    await page.goto('/practice')
    await ready(page)
    const fingers = await Fingers.on(page)
    const [a] = await cards(page)
    const flips = await countFlips(page, a!)

    await fingers.tap(a!)
    await expectPicked(page, [a!])
    await card(page, a!).evaluate(node => node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })))
    await page.waitForTimeout(200)
    await expectPicked(page, [a!])
    expect(await flips()).toBe(1)
  })

  test('a mouse click and the keyboard still pick, straight after a tap', async ({ page }) => {
    await playAsNewPlayer(page)
    await page.goto('/practice')
    await ready(page)
    const fingers = await Fingers.on(page)
    const [a, b] = await cards(page)

    await fingers.tap(a!)
    await expectPicked(page, [a!])
    await card(page, b!).click()
    await expectPicked(page, [a!, b!])
    await card(page, b!).click()
    await expectPicked(page, [a!])

    await fingers.tap(a!)
    await expectPicked(page, [])
    // The tap's own click, still on its way, would cut a key press short. It is past by now, and the tap still recent.
    await page.waitForTimeout(300)
    await card(page, a!).focus()
    await page.keyboard.press('Space')
    await expectPicked(page, [a!])
    await page.keyboard.press('Enter')
    await expectPicked(page, [])
  })

  test('dragging over the board scrolls the page and picks nothing, and neither does the tap that stops it gliding', async ({ page }) => {
    await playAsNewPlayer(page)
    await page.goto('/practice')
    await ready(page)
    // A page much longer than the screen, whatever the phone.
    await page.evaluate(() => document.body.append(Object.assign(document.createElement('div'), { style: 'height: 3000px' })))
    const fingers = await Fingers.on(page)
    const board = await cards(page)
    const scrollY = () => page.evaluate(() => window.scrollY)

    await fingers.press(board[7]!)
    await fingers.drag([{ dx: 0, dy: -160 }])
    await fingers.lift()
    expect(await scrollY()).toBeGreaterThan(50)
    expect(await picked(page)).toEqual([])

    // The flick leaves the page gliding for half a second. A finger landing on a card meanwhile stops it there.
    const landing = page.evaluate(() => new Promise<{ card: string | null; scrollY: number; sinceScroll: number }>(resolve => {
      let scrolledAt = -Infinity
      document.addEventListener('scroll', () => { scrolledAt = performance.now() }, true)
      document.addEventListener('pointerdown', event => resolve({
        card: (event.target as Element).closest('[data-card-id]')?.getAttribute('data-card-id') ?? null,
        scrollY: window.scrollY,
        sinceScroll: performance.now() - scrolledAt
      }), { capture: true, once: true })
    }))
    const last = board[board.length - 1]!
    await fingers.tap(last)
    const landed = await landing
    expect(landed.card).toBe(String(last))
    expect(landed.sinceScroll).toBeLessThan(50)
    // Left alone it would glide on some 240px. Stopping takes a frame or two, about 20px.
    await page.waitForTimeout(400)
    expect(Math.abs(await scrollY() - landed.scrollY)).toBeLessThan(60)
    expect(await picked(page)).toEqual([])

    // Once the page is still, a tap picks again, even one that wobbles a little.
    await fingers.press(last)
    await fingers.drag([{ dx: 3, dy: 3 }], 1)
    await fingers.lift()
    await expectPicked(page, [last])
  })
})

const APART = [{ dx: -60, dy: 0 }, { dx: 60, dy: 0 }]

const BROWSERS = [
  { name: 'by the cards’ touch-action', likeSafari: false },
  { name: 'by cancelling touch events, in a browser like Safari that ignores the cards’ touch-action', likeSafari: true }
]

for (const { name, likeSafari } of BROWSERS) {
  test.describe(`pinching, held off ${name}`, () => {
    async function open(page: Page) {
      await playAsNewPlayer(page)
      // The board takes a browser with gesture events for Safari.
      if (likeSafari) await page.addInitScript(() => { (window as unknown as { GestureEvent: typeof Event }).GestureEvent = class extends Event {} })
      await page.goto('/practice')
      await ready(page)
      if (!likeSafari) return
      await page.addStyleTag({ content: 'button[data-card-id] { touch-action: manipulation !important }' })
      await expect(card(page, (await cards(page))[0]!)).toHaveCSS('touch-action', 'manipulation')
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))
    }

    test('two cards pulled apart don’t zoom the page, and neither is picked', async ({ page }) => {
      await open(page)
      const fingers = await Fingers.on(page)
      const board = await cards(page)

      // The outer cards of the second row.
      await fingers.press(board[3]!, board[5]!)
      await fingers.drag(APART)
      await fingers.lift()
      await expectNoZoom(page)
      expect(await picked(page)).toEqual([])

      // Pushed together, the same.
      await fingers.press(board[3]!, board[5]!)
      await fingers.drag([{ dx: 40, dy: 0 }, { dx: -40, dy: 0 }])
      await fingers.lift()
      await expectNoZoom(page)
      expect(await picked(page)).toEqual([])
    })

    test('two thumbs that slide apart a little as they press pick both cards, and don’t zoom the page', async ({ page }) => {
      await open(page)
      const fingers = await Fingers.on(page)
      const board = await cards(page)

      // As far as a finger may slide and still be a tap.
      await fingers.press(board[3]!, board[5]!)
      await fingers.drag([{ dx: -16, dy: 0 }, { dx: 16, dy: 0 }], 3)
      await fingers.lift()
      await expectPicked(page, [board[3]!, board[5]!])
      await expectNoZoom(page)
    })

    test('a finger on a card and another off the cards don’t zoom the page, whichever lands first', async ({ page }) => {
      await open(page)
      const fingers = await Fingers.on(page)
      const board = await cards(page)
      const gap = await gapBetween(page, board[4]!, board[5]!)
      const above = await aboveBoard(page, 195)
      expect(await isOnCard(page, gap)).toBe(false)
      expect(await isOnCard(page, above)).toBe(false)

      // The other finger in the gap beside the next card.
      await fingers.press(board[3]!)
      await fingers.press(gap)
      await fingers.drag(APART)
      await fingers.lift()
      await expectNoZoom(page)

      // The other finger on the page above the board.
      await fingers.press(board[7]!)
      await fingers.press(above)
      await fingers.drag([{ dx: 0, dy: 60 }, { dx: 0, dy: -60 }])
      await fingers.lift()
      await expectNoZoom(page)

      // And with that finger down first.
      await fingers.press(above)
      await fingers.press(board[7]!)
      await fingers.drag([{ dx: 0, dy: -60 }, { dx: 0, dy: 60 }])
      await fingers.lift()
      await expectNoZoom(page)
      expect(await picked(page)).toEqual([])
    })

    test('a pinch that starts off the cards still zooms the page', async ({ page }) => {
      await open(page)
      const fingers = await Fingers.on(page)
      const [left, right] = [await aboveBoard(page, 120), await aboveBoard(page, 270)]
      expect(await isOnCard(page, left)).toBe(false)
      expect(await isOnCard(page, right)).toBe(false)

      await fingers.press(left, right)
      await fingers.drag(APART)
      await fingers.lift()
      await expect.poll(() => zoom(page)).toBeGreaterThan(1.2)
      expect(await picked(page)).toEqual([])
    })

    test('one finger still scrolls the page from a card, and still picks with a tap', async ({ page }) => {
      await open(page)
      await page.evaluate(() => document.body.append(Object.assign(document.createElement('div'), { style: 'height: 3000px' })))
      const fingers = await Fingers.on(page)
      const board = await cards(page)

      await fingers.press(board[7]!)
      await fingers.drag([{ dx: 0, dy: -160 }])
      await fingers.lift()
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(50)
      expect(await picked(page)).toEqual([])

      // Back at the top and at rest.
      await page.waitForTimeout(1000)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(500)
      await fingers.tap(board[7]!)
      await expectPicked(page, [board[7]!])
      await page.waitForTimeout(500)
      await expectPicked(page, [board[7]!])
    })

    // Safari sends these to say a pinch is starting or going on; no other browser has them.
    const gestureEventsRefused = (page: Page) => page.evaluate(() => ['gesturestart', 'gesturechange'].map(type => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      document.body.dispatchEvent(event)
      return event.defaultPrevented
    }))

    test(likeSafari ? 'Safari’s own pinch events are refused while a finger is on a card, and only then' : 'with no gesture events in the browser, the board leaves touch events alone', async ({ page }) => {
      await open(page)
      const fingers = await Fingers.on(page)
      const board = await cards(page)
      const refusedWithCard = likeSafari ? [true, true] : [false, false]

      expect(await gestureEventsRefused(page)).toEqual([false, false])

      await fingers.press(await aboveBoard(page, 120), await aboveBoard(page, 270))
      expect(await gestureEventsRefused(page)).toEqual([false, false])
      await fingers.lift()

      await fingers.press(board[3]!)
      await fingers.press(await aboveBoard(page, 195))
      expect(await gestureEventsRefused(page)).toEqual(refusedWithCard)
      await fingers.lift(board[3]!)
      expect(await gestureEventsRefused(page)).toEqual([false, false])
      await fingers.lift()
      expect(await gestureEventsRefused(page)).toEqual([false, false])
    })
  })
}
