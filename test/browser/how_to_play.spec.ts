import { test, expect, type Locator, type Page } from '@playwright/test'

// Every page with the header menu.
const PAGES = ['/', '/practice', '/puzzle', '/m', '/stats']

const box = async (locator: Locator) => (await locator.boundingBox())!
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const menuButton = (page: Page) => page.getByRole('button', { name: 'Menu', exact: true })

async function openHowToPlay(page: Page): Promise<Locator> {
  await menuButton(page).click()
  await page.getByRole('menuitem', { name: 'How to play', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'How to play' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-revealed="true"]')).toBeVisible()
  return dialog
}

/** What every opening shows, whatever the page or the screen. */
async function expectTheRules(dialog: Locator) {
  await expect(dialog.getByRole('heading', { name: 'How to play' })).toBeVisible()
  await expect(dialog.getByText('Select three cards that make a set.')).toBeVisible()
  await expect(dialog.locator('[data-demo-card]')).toHaveCount(6)
  await expect(dialog.locator('[data-in-set="true"]')).toHaveCount(3)
  await expect(dialog.getByRole('list', { name: 'Why it’s a set' }).getByRole('listitem')).toHaveText([/^Number (same|different)$/, /^Color (same|different)$/, /^Shape (same|different)$/, /^Shading (same|different)$/])
  await expect(dialog.getByRole('term')).toHaveText(['Daily Deal', 'Puzzle', 'Practice', 'Multiplayer'])
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeInViewport({ ratio: 1 })
}

test.describe('on a desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  for (const path of PAGES) {
    test(`How to play opens from the menu on ${path}`, async ({ page }) => {
      await page.goto(path)
      const dialog = await openHowToPlay(page)
      await expectTheRules(dialog)

      // A dialog in the middle of the screen, the rules beside the example rather than a phone sheet stretched tall.
      const panel = await box(dialog.locator('[data-how-to-play-panel]'))
      expect(panel.width).toBeGreaterThan(700)
      expect(panel.height).toBeLessThan(560)
      expect(Math.abs(panel.x + panel.width / 2 - 640)).toBeLessThanOrEqual(8)
      expect(Math.abs(panel.y + panel.height / 2 - 400)).toBeLessThanOrEqual(1)
      const rule = await box(dialog.getByText('Select three cards that make a set.'))
      const example = await box(dialog.locator('#rules-demo-root'))
      const modes = await box(dialog.getByRole('heading', { name: 'Game modes' }))
      expect(example.x).toBeGreaterThanOrEqual(rule.x + rule.width)
      expect(modes.x).toBeCloseTo(rule.x, 0)
      expect(modes.y).toBeLessThan(example.y + example.height)
      // Nothing to scroll for.
      expect(await dialog.locator('[data-how-to-play-body]').evaluate(body => body.scrollHeight - body.clientHeight)).toBeLessThanOrEqual(0)
      expect(await overflow(page)).toBeLessThanOrEqual(0)

      await dialog.getByRole('button', { name: 'Close' }).click()
      await expect(dialog).toBeHidden()
    })
  }

  test('How to play is a modal: focus stays in it, the page behind holds still, and Escape, a click outside or Close dismiss it', async ({ page }) => {
    await page.goto('/stats')
    // A page tall enough to scroll, however little there is to show.
    await page.addStyleTag({ content: 'main { min-height: 3000px }' })
    const wheel = async () => {
      await page.mouse.move(640, 400)
      await page.mouse.wheel(0, 600)
    }
    await wheel()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await page.evaluate(() => window.scrollTo(0, 0))

    const dialog = await openHowToPlay(page)
    const panel = dialog.locator('[data-how-to-play-panel]')
    await expect(dialog).toHaveAccessibleDescription('Select three cards that make a set.')
    expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(true)

    // Focus starts on Close and Tab never reaches the page behind.
    const close = dialog.getByRole('button', { name: 'Close' })
    await expect(close).toBeFocused()
    for (let press = 0; press < 6; press++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => {
        const active = document.activeElement
        return active === document.body || Boolean(active?.closest('#how-to-play'))
      }), `Tab ${press + 1} stays in the dialog`).toBe(true)
    }
    await close.focus()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'New example', exact: true })).toBeFocused()

    // The page behind doesn't scroll.
    await wheel()
    await page.waitForTimeout(250)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    // Escape closes it and focus goes back to the menu button.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(menuButton(page)).toBeFocused()
    await wheel()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await page.evaluate(() => window.scrollTo(0, 0))

    // A click outside closes it; a drag that starts inside and ends outside doesn't.
    await openHowToPlay(page)
    const inside = await box(panel)
    await page.mouse.move(inside.x + 40, inside.y + 120)
    await page.mouse.down()
    await page.mouse.move(20, 20, { steps: 4 })
    await page.mouse.up()
    await expect(dialog).toBeVisible()
    await page.mouse.click(20, 20)
    await expect(dialog).toBeHidden()
    await expect(menuButton(page)).toBeFocused()

    // It opens again with a fresh example, from the top.
    await openHowToPlay(page)
    await expect(dialog.locator('[data-example="0"]')).toBeVisible()
    await close.click()
    await expect(dialog).toBeHidden()
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('')
  })

  test('How to play shows its example at once when motion is reduced', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/stats')
    await menuButton(page).click()
    await page.getByRole('menuitem', { name: 'How to play', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'How to play' })
    // Without the pause before the set lights up, and without the entrance animation.
    await expect(dialog.locator('[data-revealed="true"]')).toBeVisible({ timeout: 400 })
    expect(await dialog.locator('[data-how-to-play-panel]').evaluate(panel => getComputedStyle(panel).animationName)).toBe('none')
    await dialog.getByRole('button', { name: 'New example', exact: true }).click()
    await expect(dialog.locator('[data-example="1"][data-revealed="true"]')).toBeVisible({ timeout: 400 })
  })

  test('How to play follows the dark theme on the stats page as on the game', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    const looks: string[] = []
    for (const path of ['/', '/stats']) {
      await page.goto(path)
      const dialog = await openHowToPlay(page)
      const panel = dialog.locator('[data-how-to-play-panel]')
      expect(await panel.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgb(255, 255, 255)')
      // The same type and size on both pages: the stats page's own styles don't leak in.
      looks.push(JSON.stringify(await dialog.evaluate(element => {
        const title = getComputedStyle(element.querySelector('h2')!)
        const panelBox = element.querySelector('[data-how-to-play-panel]')!.getBoundingClientRect()
        return [title.fontSize, title.fontWeight, title.letterSpacing, title.color, Math.round(panelBox.width), Math.round(panelBox.height)]
      })))
    }
    expect(looks[1]).toBe(looks[0])
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  for (const path of PAGES) {
    test(`How to play opens from the menu on ${path}`, async ({ page }) => {
      await page.goto(path)
      const dialog = await openHowToPlay(page)
      await expectTheRules(dialog)

      // A sheet across the bottom of the screen, with room above it to tap out.
      const panel = await box(dialog.locator('[data-how-to-play-panel]'))
      expect(panel.x).toBe(0)
      expect(panel.width).toBe(390)
      expect(panel.y + panel.height).toBeCloseTo(844, 0)
      expect(panel.y).toBeGreaterThanOrEqual(24)
      // One column: the rule, the example, then the modes.
      const rule = await box(dialog.getByText('Select three cards that make a set.'))
      const example = await box(dialog.locator('#rules-demo-root'))
      const modes = await box(dialog.getByRole('heading', { name: 'Game modes' }))
      expect(example.y).toBeGreaterThan(rule.y + rule.height)
      expect(modes.y).toBeGreaterThanOrEqual(example.y + example.height)
      expect(await overflow(page)).toBeLessThanOrEqual(0)

      await page.touchscreen.tap(195, 12)
      await expect(dialog).toBeHidden()
    })
  }

  test('How to play scrolls inside itself on a short screen and keeps Close in reach', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 })
    await page.goto('/stats')
    const dialog = await openHowToPlay(page)
    const body = dialog.locator('[data-how-to-play-body]')
    const panel = await box(dialog.locator('[data-how-to-play-panel]'))
    expect(panel.y).toBeGreaterThanOrEqual(24)
    expect(panel.y + panel.height).toBeCloseTo(560, 0)
    expect(await body.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(0)

    const last = dialog.getByRole('term').filter({ hasText: 'Multiplayer' })
    await expect(last).not.toBeInViewport()
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport({ ratio: 1 })
    await expect(dialog.getByRole('button', { name: 'Close' })).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    // The next opening starts from the top again.
    await dialog.getByRole('button', { name: 'Close' }).tap()
    await expect(dialog).toBeHidden()
    await openHowToPlay(page)
    expect(await body.evaluate(element => element.scrollTop)).toBe(0)
  })

  test('How to play fits the narrowest phones', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    for (const path of ['/', '/stats']) {
      await page.goto(path)
      const dialog = await openHowToPlay(page)
      expect(await overflow(page), `${path} doesn't spill sideways`).toBeLessThanOrEqual(0)
      const body = dialog.locator('[data-how-to-play-body]')
      expect(await body.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0)
      await expect(dialog.getByRole('button', { name: 'Close' })).toBeInViewport({ ratio: 1 })
      // The four reasons sit in four even columns under the cards, each on its own two lines.
      const reasons = await dialog.getByRole('list', { name: 'Why it’s a set' }).getByRole('listitem').evaluateAll(items => items.map(item => {
        const rect = item.getBoundingClientRect()
        return { width: Math.round(rect.width), height: Math.round(rect.height), spills: item.scrollWidth > item.clientWidth }
      }))
      expect(new Set(reasons.map(reason => reason.width)).size).toBe(1)
      expect(new Set(reasons.map(reason => reason.height)).size).toBe(1)
      expect(reasons.some(reason => reason.spills)).toBe(false)
    }
  })
})
