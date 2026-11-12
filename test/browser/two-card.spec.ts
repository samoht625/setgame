import { test, expect, type Page } from '@playwright/test'
import { isSet, thirdCard } from '../../app/javascript/lib/rules'
import { playAsNewPlayer } from './players'

async function playAs(page: Page, name: string) {
  const id = await playAsNewPlayer(page)
  await page.addInitScript(([id, name]) => localStorage.setItem(`setgame_player_name:${id}`, name!), [id, name])
}

async function cards(page: Page): Promise<number[]> {
  return page.locator('[data-card-id]').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-card-id'))))
}

function pairs(board: number[]): { complete: number[][]; missing: number[][] } {
  const complete: number[][] = []
  const missing: number[][] = []
  for (let i = 0; i < board.length; i++)
    for (let j = i + 1; j < board.length; j++)
      (board.includes(thirdCard(board[i]!, board[j]!)!) ? complete : missing).push([board[i]!, board[j]!])
  return { complete, missing }
}

const card = (page: Page, id: number) => page.locator(`[data-card-id="${id}"]`)
const picked = (page: Page) => page.locator('[data-card-id][aria-pressed="true"]')

/** Opens the header menu and reads the Two-card sets switch, leaving the menu closed. */
async function expectTwoCardSetting(page: Page, state: 'on' | 'off') {
  await page.getByRole('button', { name: 'Menu' }).click()
  const item = page.getByRole('menuitemcheckbox', { name: 'Two-card sets', exact: true })
  await expect(item).toHaveAccessibleDescription('Pick two cards and the game picks the third')
  await expect(item).toHaveAttribute('aria-checked', String(state === 'on'))
  await page.keyboard.press('Escape')
  await expect(item).toHaveCount(0)
}

/** Flips the switch in the header menu and waits for the server to have it. */
async function switchTwoCard(page: Page, to: 'on' | 'off') {
  await page.getByRole('button', { name: 'Menu' }).click()
  const item = page.getByRole('menuitemcheckbox', { name: 'Two-card sets', exact: true })
  await expect(item).toHaveAttribute('aria-checked', String(to === 'off'))
  // On the label: the middle of the row is the info mark.
  await item.click({ position: { x: 20, y: 20 } })
  await expect(page.getByText(`Two-card sets ${to}`, { exact: true })).toBeVisible()
}

async function startPuzzle(page: Page): Promise<number[]> {
  await page.goto('/puzzle')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]')).toHaveCount(12)
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  return cards(page)
}

test('Puzzle, two-card sets on by default (rose): a pair finds its set, or misses when the third card is missing', async ({ page }) => {
  await playAs(page, 'rose')
  const board = await startPuzzle(page)
  const { complete, missing } = pairs(board)

  const [a, b] = complete[0]!
  await card(page, a!).click()
  await card(page, b!).click()
  // The completed set shows briefly, with the filled-in card marked, before it's claimed.
  await expect(page.locator('[data-completed]')).toHaveCount(3)
  await expect(card(page, thirdCard(a!, b!)!)).toHaveAttribute('data-completed', 'filled')
  await expect(page.locator('[data-found-set]')).toHaveCount(1)
  await expect(page.locator('[data-completed]')).toHaveCount(0)
  await expect(page.getByText(`1 of 6`)).toBeVisible()

  for (const id of missing[0]!) await card(page, id).click()
  await expect(page.getByText("The third card isn't on the board")).toBeVisible()
  await expect(page.locator('[data-completed]')).toHaveCount(0)
  await expect(page.locator('[data-found-set]')).toHaveCount(1)
  await expect(page.locator('[data-card-id][aria-pressed="true"]')).toHaveCount(0)
})

test('Puzzle, two-card sets on: a repeat shows red, never amber, and costs nothing', async ({ page }) => {
  await playAs(page, 'Rose')
  const board = await startPuzzle(page)
  const [a, b] = pairs(board).complete[0]!
  const third = thirdCard(a!, b!)!

  await card(page, a!).click()
  await card(page, b!).click()
  await expect(page.locator('[data-found-set]')).toHaveCount(1)
  await expect(page.locator('[data-completed]')).toHaveCount(0)

  // Record every frame from before the pair's second click until the repeat clears.
  await page.evaluate(() => {
    const w = window as unknown as { amberSeen: boolean; repeatFrames: number }
    w.amberSeen = false
    w.repeatFrames = 0
    const tick = () => {
      if (document.querySelector('[data-completed]')) w.amberSeen = true
      if (document.querySelectorAll('[data-repeat]').length === 3) w.repeatFrames += 1
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await card(page, b!).click()
  await card(page, a!).click()
  await expect(page.locator('[data-repeat]')).toHaveCount(3)
  await expect(card(page, third)).toHaveAttribute('data-repeat', 'filled')
  await expect(page.getByText('Already found')).toBeVisible()
  // Clicks during the hold are ignored.
  const other = board.find(id => ![a, b, third].includes(id))!
  await card(page, other).click({ force: true })
  await expect(page.locator('[data-repeat]')).toHaveCount(0)
  await expect(page.locator('[data-card-id][aria-pressed="true"]')).toHaveCount(0)
  const seen = await page.evaluate(() => {
    const w = window as unknown as { amberSeen: boolean; repeatFrames: number }
    return { amberSeen: w.amberSeen, repeatFrames: w.repeatFrames }
  })
  expect(seen.amberSeen).toBe(false)
  expect(seen.repeatFrames).toBeGreaterThan(5)

  await expect(page.locator('[data-found-set]')).toHaveCount(1)
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('setgame_puzzle_v1')!))
  expect(saved.misses).toBe(0)
  expect(saved.attempts).toBe('h')
})

test('Puzzle, two-card sets off by default (any other name): two cards stay picked until the third', async ({ page }) => {
  await playAs(page, 'Wily Coyote')
  const board = await startPuzzle(page)
  await expectTwoCardSetting(page, 'off')
  const pair = pairs(board).complete[0]!

  for (const id of pair) await card(page, id).click()
  await expect(page.locator('[data-card-id][aria-pressed="true"]')).toHaveCount(2)
  await expect(page.locator('[data-found-set]')).toHaveCount(0)

  const third = board.find(id => !pair.includes(id) && isSet(pair[0]!, pair[1]!, id))!
  await card(page, third).click()
  await expect(page.locator('[data-found-set]')).toHaveCount(1)
  await expect(page.locator('[data-completed]')).toHaveCount(0)
})

test('Practice, two-card sets on by default (Yaniv): the completed set shows, then is claimed', async ({ page }) => {
  await playAs(page, 'Yaniv')
  await page.goto('/practice')
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  await expectTwoCardSetting(page, 'on')
  const [a, b] = pairs(await cards(page)).complete[0]!

  await card(page, a!).click()
  await card(page, b!).click()
  await expect(page.locator('[data-completed]')).toHaveCount(3)
  await expect(card(page, thirdCard(a!, b!)!)).toHaveAttribute('data-completed', 'filled')
  // A click during the pause neither picks a card nor restarts the highlight.
  const other = (await cards(page)).find(id => ![a, b, thirdCard(a!, b!)].includes(id))!
  await card(page, other).click({ force: true })
  await expect(page.getByText('Set found!')).toBeVisible()
  await expect(page.locator('[data-completed]')).toHaveCount(0)
  await expect(page.locator('[data-card-id][aria-pressed="true"]')).toHaveCount(0)
  await expect(card(page, a!)).toHaveCount(0)
})

test('Daily Deal, two-card sets on by default (Rose): the completed set shows, then is claimed', async ({ page }) => {
  await playAs(page, 'Rose')
  await page.goto('/daily')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  const [a, b] = pairs(await cards(page)).complete[0]!

  await card(page, a!).click()
  await card(page, b!).click()
  await expect(page.locator('[data-completed]')).toHaveCount(3)
  await expect(page.getByText('Set found!')).toBeVisible()
  await expect(page.locator('[data-completed]')).toHaveCount(0)
  await expect(card(page, a!)).toHaveCount(0)
})

test('Multiplayer, two-card sets on by default (Tido): the server completes the pair or calls it a miss', async ({ page }) => {
  await playAs(page, 'Tido')
  await page.goto('/m')
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  await expect(page.getByText('Tido').first()).toBeVisible()
  const { complete, missing } = pairs(await cards(page))

  for (const id of missing[0]!) await card(page, id).click()
  await expect(page.getByText("The third card isn't on the board")).toBeVisible()

  const [a, b] = complete[0]!
  await card(page, a!).click()
  await card(page, b!).click()
  await expect(card(page, thirdCard(a!, b!)!)).toHaveAttribute('data-completed', 'filled')
  await expect(page.getByText('You found a set!')).toBeVisible()
  // The highlight gives way to the server's usual found reveal.
  await expect(page.locator('[data-completed]')).toHaveCount(0)
  await expect(page.getByText('You found a set!')).toBeVisible()
})

const twoCardInfo = 'Pick two cards and the game picks the third'

test('The Two-card sets row is one line like Sound; its info mark explains it on hover or from the keyboard', async ({ page }) => {
  await playAs(page, 'Ada')
  await page.goto('/puzzle')
  await page.getByRole('button', { name: 'Menu' }).click()
  const item = page.getByRole('menuitemcheckbox', { name: 'Two-card sets', exact: true })
  const sound = page.getByRole('menuitemcheckbox', { name: 'Sound', exact: true })
  const tip = page.getByRole('tooltip')
  await expect(tip).toBeHidden()
  expect((await item.boundingBox())!.height).toBe((await sound.boundingBox())!.height)

  await item.locator('[data-menu-info]').hover()
  await expect(tip).toBeVisible()
  await expect(tip).toHaveText(twoCardInfo)
  // The tooltip stays inside the menu, so the menu's scrolling can't clip it.
  const menuBox = (await page.getByRole('menu').boundingBox())!
  const tipBox = (await tip.boundingBox())!
  expect(tipBox.x).toBeGreaterThanOrEqual(menuBox.x)
  expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(menuBox.x + menuBox.width)
  expect(tipBox.y).toBeGreaterThanOrEqual(menuBox.y)

  // Clicking the mark keeps the tooltip and the menu, and leaves the switch alone.
  await item.locator('[data-menu-info]').click()
  await expect(tip).toBeVisible()
  await expect(item).toHaveAttribute('aria-checked', 'false')
  await sound.hover()
  await expect(tip).toBeHidden()

  // Reached with the arrow keys, the row shows the tooltip while it has focus.
  await sound.focus()
  await page.keyboard.press('ArrowDown')
  await expect(item).toBeFocused()
  await expect(tip).toBeVisible()
  await page.keyboard.press('ArrowUp')
  await expect(sound).toBeFocused()
  await expect(tip).toBeHidden()
})

type TooltipLog = { appearances: number; dips: number }

/**
 * Watches the tooltip every frame: how often it started to appear, and how many
 * frames it spent below full strength after reaching it (fading, or blinking).
 */
async function watchTooltip(page: Page) {
  await page.evaluate(() => {
    const tip = document.querySelector<HTMLElement>('[role="tooltip"]')!
    const log = { appearances: 0, dips: 0 }
    let shown = false
    let full = false
    const frame = () => {
      const style = getComputedStyle(tip)
      const visible = style.visibility === 'visible'
      const opacity = Number(style.opacity)
      if (visible && !shown) log.appearances++
      if (visible && full && opacity < 1) log.dips++
      shown = visible
      full = visible && (full || opacity === 1)
      requestAnimationFrame(frame)
    }
    frame()
    ;(window as unknown as { tooltipLog: typeof log }).tooltipLog = log
  })
}

const tooltipLog = (page: Page): Promise<TooltipLog> =>
  page.evaluate(() => ({ ...(window as unknown as { tooltipLog: TooltipLog }).tooltipLog }))

test('Hovering the info mark is steady: no flash in passing, no blink at its edge, and the bubble and arrow fade as one', async ({ page }) => {
  await playAs(page, 'Ada')
  await page.goto('/puzzle')
  await page.getByRole('button', { name: 'Menu' }).click()
  const item = page.getByRole('menuitemcheckbox', { name: 'Two-card sets', exact: true })
  const tip = page.locator('[role="tooltip"]')
  const box = (await item.locator('[data-menu-info]').boundingBox())!
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await watchTooltip(page)

  // The mark sits mid-menu: a pointer crossing it on the way to another row never starts the tooltip.
  await page.mouse.move(centre.x, box.y - 30)
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.move(centre.x, box.y + box.height + 30)
  await page.waitForTimeout(400)
  expect(await tooltipLog(page)).toEqual({ appearances: 0, dips: 0 })

  // Resting on it shows the tooltip. The arrow is part of the bubble and points at the mark.
  await page.mouse.move(centre.x, centre.y)
  await expect(tip).toHaveCSS('opacity', '1')
  const arrowBox = (await tip.locator('[data-menu-info-arrow]').boundingBox())!
  expect(Math.abs(arrowBox.x + arrowBox.width / 2 - centre.x)).toBeLessThan(1.5)
  await expect(item.locator('[data-menu-info] [data-menu-info-arrow]')).toHaveCount(0)

  // Slipping off the mark's edge and back, again and again, never lets it fade or reappear.
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(box.x - 3, centre.y)
    await page.waitForTimeout(30)
    await page.mouse.move(box.x + 3, centre.y)
    await page.waitForTimeout(30)
  }
  await page.waitForTimeout(300)
  expect(await tooltipLog(page)).toEqual({ appearances: 1, dips: 0 })
  await expect(tip).toHaveCSS('opacity', '1')

  // Leaving for good fades it out instead of cutting it off.
  await page.mouse.move(box.x - 60, centre.y)
  await expect(tip).toBeHidden()
  const log = await tooltipLog(page)
  expect(log.appearances).toBe(1)
  expect(log.dips).toBeGreaterThan(0)
  // The pointer is still on the row, so the row keeps its own highlight.
  expect(await item.evaluate(node => node.matches(':hover'))).toBe(true)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('tapping the Two-card sets info mark shows and hides the tooltip without flipping the switch', async ({ page }) => {
    await playAs(page, 'Ada')
    await page.goto('/puzzle')
    await page.getByRole('button', { name: 'Menu' }).tap()
    const item = page.getByRole('menuitemcheckbox', { name: 'Two-card sets', exact: true })
    const tip = page.getByRole('tooltip')

    await item.locator('[data-menu-info]').tap()
    await expect(tip).toBeVisible()
    await expect(tip).toHaveText(twoCardInfo)
    await expect(item).toHaveAttribute('aria-checked', 'false')
    await item.locator('[data-menu-info]').tap()
    await expect(tip).toBeHidden()
    await expect(item).toHaveAttribute('aria-checked', 'false')

    // The rest of the row is still the switch.
    await item.tap({ position: { x: 20, y: 20 } })
    await expect(page.getByText('Two-card sets on', { exact: true })).toBeVisible()
  })
})

test('Switching two-card sets off sticks for a default-on name, across a reload', async ({ page }) => {
  await playAs(page, 'Tido')
  await page.goto('/puzzle')
  await expect(page.locator('meta[name="setgame-two-card"]')).toHaveCount(0)
  await expectTwoCardSetting(page, 'on')
  await switchTwoCard(page, 'off')
  await expectTwoCardSetting(page, 'off')

  // The choice is the server's: the reloaded page carries it.
  await page.reload()
  await expect(page.locator('meta[name="setgame-two-card"]')).toHaveAttribute('content', 'off')
  await expectTwoCardSetting(page, 'off')

  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  const board = await cards(page)
  const pair = pairs(board).complete[0]!
  for (const id of pair) await card(page, id).click()
  await expect(picked(page)).toHaveCount(2)
  await expect(page.locator('[data-completed]')).toHaveCount(0)
  await expect(page.locator('[data-found-set]')).toHaveCount(0)
  await card(page, thirdCard(pair[0]!, pair[1]!)!).click()
  await expect(page.locator('[data-found-set]')).toHaveCount(1)
})

test('Switching two-card sets on works under any other name, in every game, across a reload', async ({ page }) => {
  await playAs(page, 'Wily Coyote')
  await page.goto('/practice')
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  const before = pairs(await cards(page)).complete[0]!
  for (const id of before) await card(page, id).click()
  await expect(picked(page)).toHaveCount(2)
  for (const id of before) await card(page, id).click()
  await expect(picked(page)).toHaveCount(0)

  await switchTwoCard(page, 'on')
  for (const id of before) await card(page, id).click()
  await expect(card(page, thirdCard(before[0]!, before[1]!)!)).toHaveAttribute('data-completed', 'filled')
  await expect(page.getByText('Set found!')).toBeVisible()
  await expect(card(page, before[0]!)).toHaveCount(0)

  await page.goto('/puzzle')
  await expect(page.locator('meta[name="setgame-two-card"]')).toHaveAttribute('content', 'on')
  await expectTwoCardSetting(page, 'on')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  const [a, b] = pairs(await cards(page)).complete[0]!
  await card(page, a!).click()
  await card(page, b!).click()
  await expect(page.locator('[data-completed]')).toHaveCount(3)
  await expect(page.locator('[data-found-set]')).toHaveCount(1)

  await page.goto('/daily')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  const [c, d] = pairs(await cards(page)).complete[0]!
  await card(page, c!).click()
  await card(page, d!).click()
  await expect(page.locator('[data-completed]')).toHaveCount(3)
  await expect(page.getByText('Set found!')).toBeVisible()

  // Off again, and it stays off.
  await switchTwoCard(page, 'off')
  await page.reload()
  await expect(page.locator('meta[name="setgame-two-card"]')).toHaveAttribute('content', 'off')
  await expectTwoCardSetting(page, 'off')
})

test('Multiplayer follows the setting: switched on under another name, the server completes the pair', async ({ page }) => {
  await playAs(page, 'Pat')
  await page.goto('/m')
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  await expect(page.getByText('Pat').first()).toBeVisible()

  // Off by default: two cards wait for a third.
  const first = pairs(await cards(page)).complete[0]!
  for (const id of first) await card(page, id).click()
  await expect(picked(page)).toHaveCount(2)
  for (const id of first) await card(page, id).click()
  await expect(picked(page)).toHaveCount(0)

  await switchTwoCard(page, 'on')
  const { complete, missing } = pairs(await cards(page))
  for (const id of missing[0]!) await card(page, id).click()
  await expect(page.getByText("The third card isn't on the board")).toBeVisible()

  const [a, b] = complete[0]!
  await card(page, a!).click()
  await card(page, b!).click()
  await expect(card(page, thirdCard(a!, b!)!)).toHaveAttribute('data-completed', 'filled')
  await expect(page.getByText('You found a set!')).toBeVisible()
})

test('Multiplayer follows the setting: switched off by Tido, a pair waits for its third card', async ({ page }) => {
  await playAs(page, 'Tido')
  await page.goto('/m')
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  await expect(page.getByText('Tido').first()).toBeVisible()
  await switchTwoCard(page, 'off')

  await page.reload()
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  await expect(page.getByText('Tido').first()).toBeVisible()
  const [a, b] = pairs(await cards(page)).complete[0]!
  await card(page, a!).click()
  await card(page, b!).click()
  await expect(picked(page)).toHaveCount(2)
  await expect(page.locator('[data-completed]')).toHaveCount(0)
  await card(page, thirdCard(a!, b!)!).click()
  await expect(page.getByText('You found a set!')).toBeVisible()
  await expect(page.locator('[data-completed]')).toHaveCount(0)
})
