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

async function startPuzzle(page: Page): Promise<number[]> {
  await page.goto('/puzzle')
  await page.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(page.locator('[data-card-id]')).toHaveCount(12)
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  return cards(page)
}

test('Puzzle, in the two-card experiment: a pair finds its set, or misses when the third card is missing', async ({ page }) => {
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

test('Puzzle, outside the experiment: two cards stay picked until the third', async ({ page }) => {
  await playAs(page, 'Wily Coyote')
  const board = await startPuzzle(page)
  const pair = pairs(board).complete[0]!

  for (const id of pair) await card(page, id).click()
  await expect(page.locator('[data-card-id][aria-pressed="true"]')).toHaveCount(2)
  await expect(page.locator('[data-found-set]')).toHaveCount(0)

  const third = board.find(id => !pair.includes(id) && isSet(pair[0]!, pair[1]!, id))!
  await card(page, third).click()
  await expect(page.locator('[data-found-set]')).toHaveCount(1)
  await expect(page.locator('[data-completed]')).toHaveCount(0)
})

test('Practice, in the two-card experiment: the completed set shows, then is claimed', async ({ page }) => {
  await playAs(page, 'Yaniv')
  await page.goto('/practice')
  await expect(page.locator('[data-card-id]').first()).toBeEnabled()
  const [a, b] = pairs(await cards(page)).complete[0]!

  await card(page, a!).click()
  await card(page, b!).click()
  await expect(page.locator('[data-completed]')).toHaveCount(3)
  await expect(card(page, thirdCard(a!, b!)!)).toHaveAttribute('data-completed', 'filled')
  await expect(page.getByText('Set found!')).toBeVisible()
  await expect(page.locator('[data-completed]')).toHaveCount(0)
  await expect(card(page, a!)).toHaveCount(0)
})

test('Daily Deal, in the two-card experiment: the completed set shows, then is claimed', async ({ page }) => {
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

test('Multiplayer, in the two-card experiment: the server completes the pair or calls it a miss', async ({ page }) => {
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
