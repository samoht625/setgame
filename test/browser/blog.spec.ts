import { test, expect, type Page } from '@playwright/test'

const POST = '/blog/spotting-sets'
const TITLE = 'Spotting “all different” Sets takes 5x longer'

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** WCAG relative luminance of a CSS rgb() color. */
function luminance(color: string) {
  const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(part => {
    const channel = Number(part) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

test('the post is all there without scripts: headline, text, both charts and the way to the game', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL })
  const page = await context.newPage()
  await page.goto(POST)

  await expect(page).toHaveTitle(`${TITLE} | Set Daily`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE)
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Each extra difference costs time', 'Not all features are equal', 'People skip the hard ones'])
  await expect(page.locator('main .kind')).toHaveCount(15)
  await expect(page.locator('main .kind').first()).toBeVisible()
  await expect(page.locator('main table.shares tbody tr')).toHaveCount(4)
  await expect(page.locator('main .prose > p').first()).toContainText('three cards make a set')
  await expect(page.locator('main .prose a[href="/"]').first()).toBeVisible()
  await expect(page.locator('main .prose a[href="/daily"]')).toBeVisible()
  await expect(page.locator('main .prose a[href="/stats"]').first()).toBeVisible()
  await context.close()
})

for (const [name, width, height] of [['a phone', 390, 844], ['a small phone', 320, 640], ['a desktop', 1280, 900]] as const) {
  test(`on ${name} the post is one readable column with the chart inside it`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto(POST)

    expect(await overflow(page)).toBeLessThanOrEqual(0)
    const column = (await page.locator('main.blog').boundingBox())!
    expect(column.width).toBeLessThanOrEqual(760)

    const text = page.locator('main .prose > p').first()
    expect(await text.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16)
    // A comfortable measure: the text never runs the width of a wide screen.
    expect((await text.boundingBox())!.width).toBeLessThanOrEqual(720)

    // Every row of the chart is whole: label, three drawn cards, the bar and its median, all inside the card.
    const chart = (await page.locator('main .card.kinds').boundingBox())!
    expect(chart.x).toBeGreaterThanOrEqual(0)
    expect(chart.x + chart.width).toBeLessThanOrEqual(width)
    const rows = page.locator('main .kind')
    for (const index of [0, 7, 14]) {
      const row = rows.nth(index)
      await row.scrollIntoViewIfNeeded()
      for (const part of ['.kind-label', '.kind-track', '.kind-iqr', '.kind-mid', '.kind-med']) {
        const box = (await row.locator(part).boundingBox())!
        expect(box.width, `${part} of row ${index}`).toBeGreaterThan(0)
        expect(box.x, `${part} of row ${index}`).toBeGreaterThanOrEqual(chart.x)
        expect(box.x + box.width, `${part} of row ${index}`).toBeLessThanOrEqual(chart.x + chart.width + 0.5)
      }
      const cards = row.locator('.set svg.c')
      await expect(cards).toHaveCount(3)
      for (let card = 0; card < 3; card++) {
        const box = (await cards.nth(card).boundingBox())!
        expect(box.width).toBeGreaterThan(12)
        expect(box.height).toBeGreaterThan(8)
        // Drawn, not an empty frame: its shapes resolve to the page's symbols.
        const drawn = await cards.nth(card).locator('use').first().evaluate(use => {
          const id = (use.getAttribute('href') ?? use.getAttribute('xlink:href') ?? '').replace('#', '')
          return Boolean(id && document.getElementById(id))
        })
        expect(drawn).toBe(true)
      }
    }
    // The median line sits on its bar, and slower kinds sit further right.
    const medians = await page.locator('main .kind-mid').evaluateAll(lines => lines.map(line => line.getBoundingClientRect().left - line.parentElement!.getBoundingClientRect().left))
    expect(medians).toEqual([...medians].sort((a, b) => a - b))

    const shares = (await page.locator('main .card.shares-card').boundingBox())!
    expect(shares.x + shares.width).toBeLessThanOrEqual(width)
  })
}

for (const scheme of ['light', 'dark'] as const) {
  test(`the post follows the ${scheme} theme, with text that stands out from the page`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto(POST)

    const colors = await page.evaluate(() => {
      const style = (selector: string) => getComputedStyle(document.querySelector(selector)!)
      return {
        page: style('body').backgroundColor,
        text: style('main .prose > p').color,
        heading: style('main h1').color,
        caption: style('main figcaption').color,
        card: style('main .card.kinds').backgroundColor
      }
    })
    const dark = luminance(colors.page) < 0.2
    expect(dark).toBe(scheme === 'dark')
    expect(contrast(colors.text, colors.page)).toBeGreaterThanOrEqual(7)
    expect(contrast(colors.heading, colors.page)).toBeGreaterThanOrEqual(7)
    expect(contrast(colors.caption, colors.page)).toBeGreaterThanOrEqual(4.5)
    expect(luminance(colors.card) < 0.2).toBe(scheme === 'dark')
  })
}

test('the post sits under the site’s header, and its links go where they say', async ({ page }) => {
  await page.goto(POST)

  const header = page.locator('#site-header')
  await expect(header.getByRole('link', { name: 'Set Daily' }).first()).toBeVisible()
  const modes = page.getByRole('navigation', { name: 'Game mode' })
  expect(await modes.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href')))).toEqual(['/', '/daily'])
  await expect(modes.locator('[aria-current]')).toHaveCount(0)

  await page.locator('main figcaption a[href="/stats"]').click()
  await expect(page).toHaveURL(/\/stats$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Stats' })).toBeVisible()

  await page.goto(POST)
  await page.getByRole('link', { name: 'Blog', exact: true }).click()
  await expect(page).toHaveURL(/\/blog$/)
  await expect(page).toHaveTitle('Blog | Set Daily')
  await expect(page.getByRole('heading', { level: 1, name: 'Blog' })).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(0)

  await page.getByRole('link', { name: TITLE }).click()
  await expect(page).toHaveURL(new RegExp(`${POST}$`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE)

  await page.getByRole('link', { name: 'Play today’s Puzzle' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page).toHaveTitle('Set Daily')
})

test('the blog’s index fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/blog')

  expect(await overflow(page)).toBeLessThanOrEqual(0)
  const link = page.getByRole('link', { name: TITLE })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', POST)
})
