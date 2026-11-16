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
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Every difference costs seconds',
    'Color and shading do the work',
    'The hard ones get left on the board',
    'The quickest and the rarest',
    'How this was counted'
  ])
  await expect(page.locator('main .deck')).toContainText('which sets people see at once')
  await expect(page.locator('main .versus .side')).toHaveCount(2)
  await expect(page.locator('main .versus .time b')).toHaveText(['3.0s', '15.0s'])
  await expect(page.locator('main .kind')).toHaveCount(15)
  await expect(page.locator('main .kind').first()).toBeVisible()
  await expect(page.locator('main .stairs dd')).toHaveText(['3–4s', '4–8s', '7–11s', '15s'])
  await expect(page.locator('main .shared li')).toHaveCount(10)
  await expect(page.locator('main table.shares tbody tr')).toHaveCount(4)
  await expect(page.locator('main .pair ol.sets')).toHaveCount(2)
  await expect(page.locator('main .pair ol.sets li')).toHaveCount(20)
  await expect(page.locator('main .prose > p').first()).toContainText('Both of these are sets')
  await expect(page.locator('main .notes li')).toHaveCount(5)
  await expect(page.locator('main .prose a[href="/"]').first()).toBeVisible()
  await expect(page.locator('main .play a[href="/daily"]')).toHaveText(['Daily Deal', 'Play the Daily Deal'])
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
    const size = (selector: string) => page.locator(selector).first().evaluate(node => parseFloat(getComputedStyle(node).fontSize))
    const body = await size('main .prose > p')
    expect(body).toBeGreaterThanOrEqual(17)
    // An article's measure: about 75 characters at most, and room either side of the text on a phone.
    const measure = (await text.boundingBox())!
    expect(measure.width / body).toBeLessThanOrEqual(38)
    expect(measure.x).toBeGreaterThanOrEqual(16)
    expect(measure.x + measure.width).toBeLessThanOrEqual(width - 16)
    // The headline leads, then the section headings, then the text; the small print is smaller than the text.
    const [headline, section, deck, notes] = [await size('main h1'), await size('main .prose > h2'), await size('main .deck'), await size('main .notes li')]
    expect(headline).toBeGreaterThanOrEqual(width >= 760 ? 40 : 28)
    expect(headline).toBeGreaterThan(section * 1.25)
    expect(section).toBeGreaterThan(body * 1.2)
    expect(deck).toBeGreaterThan(body)
    expect(notes).toBeLessThan(body)

    // Everything drawn sits inside the screen, and its numbers inside it.
    for (const selector of ['.versus .card', '.stairs', '.shared .card', '.card.shares-card', '.pair ol.sets', '.fact .card', '.play']) {
      const figures = page.locator(`main ${selector}`)
      for (let index = 0; index < (await figures.count()); index++) {
        const frame = (await figures.nth(index).boundingBox())!
        expect(frame.x, selector).toBeGreaterThanOrEqual(0)
        expect(frame.x + frame.width, selector).toBeLessThanOrEqual(width)
        const inner = figures.nth(index).locator('b, dd, .val, svg.c, .btn')
        for (let part = 0; part < (await inner.count()); part++) {
          const box = (await inner.nth(part).boundingBox())!
          expect(box.x, `${selector} part ${part}`).toBeGreaterThanOrEqual(frame.x)
          expect(box.x + box.width, `${selector} part ${part}`).toBeLessThanOrEqual(frame.x + frame.width + 0.5)
        }
      }
    }
    // The two example sets and the two lists sit side by side where there is room, and one above the other on a phone.
    const sides = page.locator('main .versus .side')
    const lists = page.locator('main .pair ol.sets')
    const [first, second] = [(await sides.nth(0).boundingBox())!, (await sides.nth(1).boundingBox())!]
    const [quickest, least] = [(await lists.nth(0).boundingBox())!, (await lists.nth(1).boundingBox())!]
    if (width >= 760) {
      expect(second.x).toBeGreaterThanOrEqual(first.x + first.width - 1)
      expect(least.x).toBeGreaterThanOrEqual(quickest.x + quickest.width)
      expect(Math.abs(least.y - quickest.y)).toBeLessThan(1)
    } else {
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height - 1)
      expect(least.y).toBeGreaterThanOrEqual(quickest.y + quickest.height)
    }
    // The bar under the harder set is the full width; the easier one's is a fifth of it.
    const bars = await page.locator('main .versus .len i').evaluateAll(fills => fills.map(fill => fill.getBoundingClientRect().width / fill.parentElement!.getBoundingClientRect().width))
    expect(bars[0]).toBeGreaterThan(0.19)
    expect(bars[0]).toBeLessThan(0.21)
    expect(bars[1]).toBeCloseTo(1, 2)

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

    // The highlighted labels stand out from the plain ones, and both can be read.
    const chips = await page.evaluate(() => {
      const style = (selector: string) => getComputedStyle(document.querySelector(selector)!)
      const [strong, plain] = [style('main .chips .strong'), style('main .chips span:not(.sr):not(.strong)')]
      return { strong: [strong.color, strong.backgroundColor], plain: [plain.color, plain.backgroundColor] }
    })
    expect(contrast(chips.strong[0]!, chips.strong[1]!)).toBeGreaterThanOrEqual(7)
    expect(contrast(chips.plain[0]!, chips.plain[1]!)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(chips.strong[1]!, chips.plain[1]!)).toBeGreaterThanOrEqual(3)
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
  await expect(page.locator('main .elsewhere a')).toHaveText(['Puzzle', 'Daily Deal', 'stats'])

  // The whole card opens the post, not only its headline.
  const card = (await page.locator('main .posts li').first().boundingBox())!
  await page.mouse.click(card.x + card.width - 14, card.y + card.height - 14)
  await expect(page).toHaveURL(new RegExp(`${POST}$`))
})
