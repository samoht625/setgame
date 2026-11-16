import { test, expect, type Page } from '@playwright/test'

// What the front door (the Puzzle) and the Daily Deal's page tell search
// engines, and what the tab says. The same strings are in app/views/home
// (served) and App.tsx (the tab title after a switch).
const SITE_NAME = 'Set Daily'
const HOME_HEADING = 'Daily Set Puzzle: find all 6 sets in 12 cards'
const HOME_DESCRIPTION = 'Play the daily Set puzzle free: 12 cards hold exactly 6 sets. Find all 6 and see how your time ranks. Same puzzle for everyone, new at midnight Pacific. No signup.'
const DAILY_TITLE = 'Daily Deal | Set Daily'
const DAILY_HEADING = 'Set Daily Deal: clear the whole deck, one ranked try a day'
const DAILY_DESCRIPTION = 'The Daily Deal: one deck of Set, dealt the same for everyone. Clear all 81 cards as fast as you can, one ranked try a day. New at midnight Pacific. No signup.'

/** The tags a search engine or a link preview reads from the page. */
async function headTags(page: Page) {
  return page.evaluate(() => {
    const content = (selector: string) => document.querySelector(selector)?.getAttribute('content') ?? null
    return {
      description: content('meta[name="description"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      siteName: content('meta[property="og:site_name"]'),
      ogTitle: content('meta[property="og:title"]'),
      ogDescription: content('meta[property="og:description"]'),
      ogUrl: content('meta[property="og:url"]'),
      twitterTitle: content('meta[name="twitter:title"]'),
      twitterDescription: content('meta[name="twitter:description"]'),
      structuredData: [...document.querySelectorAll('script[type="application/ld+json"]')].map(script => script.textContent ?? '')
    }
  })
}

/** The page's one main heading: in the page for search engines and screen readers, out of sight. */
async function expectHiddenMainHeading(page: Page, text: string) {
  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toHaveCount(1)
  await expect(heading).toHaveText(text)
  const box = (await heading.boundingBox())!
  expect(box.width).toBeLessThanOrEqual(1)
  expect(box.height).toBeLessThanOrEqual(1)
  // It takes no room: the header is still at the very top, and nothing scrolls sideways.
  expect((await page.locator('header').first().boundingBox())!.y).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

const modes = (page: Page) => page.getByRole('navigation', { name: 'Game mode' })

for (const path of ['/', '/puzzle']) {
  test(`${path} opens the Puzzle, titled with the site’s name, and tells search engines it is the daily Set puzzle at /`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveTitle(SITE_NAME)
    const tags = await headTags(page)
    expect(tags.siteName).toBe(SITE_NAME)
    expect(tags.ogTitle).toBe(SITE_NAME)
    expect(tags.twitterTitle).toBe(SITE_NAME)
    // The words people search for are in the description and the heading, not the title.
    expect(tags.description).toBe(HOME_DESCRIPTION)
    expect(tags.ogDescription).toBe(HOME_DESCRIPTION)
    expect(tags.twitterDescription).toBe(HOME_DESCRIPTION)
    // Honest about what opens: this page is the Puzzle, so it doesn't say the Daily Deal is here.
    expect(tags.description).not.toMatch(/Daily Deal/)
    // /puzzle is the same page, so both name / as its one address.
    expect(tags.canonical).toBe('https://setdaily.app/')
    expect(tags.ogUrl).toBe('https://setdaily.app/')
    await expectHiddenMainHeading(page, HOME_HEADING)

    await expect(modes(page).getByRole('link', { name: 'Puzzle', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(modes(page).getByRole('link', { name: 'Daily Deal', exact: true })).not.toHaveAttribute('aria-current')
    await expect(page.getByText(/^Puzzle #\d+$/).first()).toBeVisible()
    await expect(page.getByText('12 cards. 6 sets. Find them all.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  })
}

test('the front door’s structured data parses and says only what is true of the site', async ({ page }) => {
  await page.goto('/')
  const tags = await headTags(page)
  expect(tags.structuredData).toHaveLength(1)
  const data = JSON.parse(tags.structuredData[0]!)
  expect(data['@context']).toBe('https://schema.org')
  const [site, game] = data['@graph']
  expect(data['@graph']).toHaveLength(2)
  expect(site).toEqual({ '@type': 'WebSite', '@id': 'https://setdaily.app/#website', name: SITE_NAME, alternateName: 'setdaily.app', url: 'https://setdaily.app/', inLanguage: 'en' })
  expect(game).toMatchObject({
    '@type': ['VideoGame', 'WebApplication'],
    name: SITE_NAME,
    url: 'https://setdaily.app/',
    description: HOME_DESCRIPTION,
    image: 'https://setdaily.app/og-image.png',
    gamePlatform: 'Web browser',
    applicationCategory: 'GameApplication',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    isPartOf: { '@id': site['@id'] }
  })
  // No ratings, reviews, authors or search box: the site has none.
  for (const node of [site, game]) {
    for (const key of ['aggregateRating', 'review', 'author', 'publisher', 'creator', 'potentialAction']) expect(node).not.toHaveProperty(key)
  }
})

test('the Daily Deal has its own page at /daily, with its own title, description and address', async ({ page }) => {
  await page.goto('/daily')
  await expect(page).toHaveTitle(DAILY_TITLE)
  const tags = await headTags(page)
  expect(tags.siteName).toBe(SITE_NAME)
  expect(tags.ogTitle).toBe(DAILY_TITLE)
  expect(tags.twitterTitle).toBe(DAILY_TITLE)
  expect(tags.description).toBe(DAILY_DESCRIPTION)
  expect(tags.ogDescription).toBe(DAILY_DESCRIPTION)
  expect(tags.canonical).toBe('https://setdaily.app/daily')
  expect(tags.ogUrl).toBe('https://setdaily.app/daily')
  // The front door is the page for the daily Set puzzle search.
  expect(tags.description).not.toMatch(/daily set puzzle/i)
  expect(tags.structuredData).toHaveLength(0)
  await expectHiddenMainHeading(page, DAILY_HEADING)
  await expect(modes(page).getByRole('link', { name: 'Daily Deal', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText(/^Daily Deal #\d+$/).first()).toBeVisible()
  await expect(page.getByText('Same deal for everyone today.')).toBeVisible()
})

test('the tab title is the site’s name at home and “Page | Set Daily” elsewhere, as served and after every switch', async ({ page, request }) => {
  const served = async (path: string) => (await (await request.get(path)).text()).match(/<title>(.*?)<\/title>/)![1]!
  expect(await served('/')).toBe(SITE_NAME)
  expect(await served('/puzzle')).toBe(SITE_NAME)
  expect(await served('/daily')).toBe(DAILY_TITLE)
  expect(await served('/practice')).toBe('Practice | Set Daily')
  expect(await served('/m')).toBe('Multiplayer | Set Daily')

  // No title on the way reads as the Daily Deal's name ("Set Daily Deal …").
  const seen: string[] = []
  const expectTitle = async (title: string) => {
    await expect(page).toHaveTitle(title)
    seen.push(await page.title())
  }
  await page.goto('/')
  await expectTitle(SITE_NAME)
  await modes(page).getByRole('link', { name: 'Daily Deal', exact: true }).click()
  await expectTitle(DAILY_TITLE)
  await modes(page).getByRole('link', { name: 'Puzzle', exact: true }).click()
  await expectTitle(SITE_NAME)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Practice', exact: true }).click()
  await expectTitle(await served('/practice'))
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: /^Multiplayer/ }).click()
  await expectTitle(await served('/m'))
  await page.goBack()
  await page.goBack()
  await expectTitle(SITE_NAME)
  for (const title of seen) expect(title).not.toMatch(/^Set Daily Deal/)
})

test('the Puzzle / Daily Deal switch is two real links that switch in place', async ({ page, context }) => {
  await page.goto('/')
  const daily = modes(page).getByRole('link', { name: 'Daily Deal', exact: true })
  const puzzle = modes(page).getByRole('link', { name: 'Puzzle', exact: true })
  await expect(daily).toHaveAttribute('href', '/daily')
  await expect(puzzle).toHaveAttribute('href', '/')
  await expect(modes(page).getByRole('button')).toHaveCount(0)

  // A plain click switches games without loading a page: what the page holds survives.
  await page.evaluate(() => { (window as unknown as { stayed: boolean }).stayed = true })
  await daily.click()
  await expect(page).toHaveURL(/\/daily$/)
  await expect(page.getByText('Same deal for everyone today.')).toBeVisible()
  await expect(daily).toHaveAttribute('aria-current', 'page')
  await expect(puzzle).not.toHaveAttribute('aria-current')
  await puzzle.click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('12 cards. 6 sets. Find them all.')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(true)
  // Back and forward follow the switches.
  await page.goBack()
  await expect(page).toHaveURL(/\/daily$/)
  await expect(page.getByText('Same deal for everyone today.')).toBeVisible()
  await page.goForward()
  await expect(page.getByText('12 cards. 6 sets. Find them all.')).toBeVisible()
  // By keyboard too: a link takes Enter.
  await daily.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/daily$/)
  expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(true)

  // A click meant for a new tab is the browser's: it opens the link's own page.
  const opened = context.waitForEvent('page')
  await puzzle.click({ modifiers: ['ControlOrMeta'] })
  const tab = await opened
  await expect(tab).toHaveURL(new URL('/', page.url()).href)
  await expect(tab).toHaveTitle(SITE_NAME)
  await expect(page).toHaveURL(/\/daily$/)
  await tab.close()

  // In Practice the third segment is a link as well.
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Practice', exact: true }).click()
  await expect(modes(page).getByRole('link', { name: 'Practice', exact: true })).toHaveAttribute('href', '/practice')
  await expect(modes(page).getByRole('link', { name: 'Practice', exact: true })).toHaveAttribute('aria-current', 'page')
})

/** The switch's links in the order the page holds them, which is the order a keyboard and a screen reader meet them in. */
async function switchOrder(page: Page) {
  const links = modes(page).getByRole('link')
  const hrefs = await links.evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))
  const lefts = await links.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().left))
  return { links, hrefs, lefts }
}

test('the switch lists the Puzzle first, then the Daily Deal: as served, on screen and by keyboard', async ({ page, request }) => {
  // As served, before any script runs.
  for (const path of ['/', '/daily', '/puzzle', '/practice', '/m']) {
    const html = await (await request.get(path)).text()
    const nav = html.match(/<nav aria-label="Game mode"[^>]*>(.*?)<\/nav>/s)?.[1] ?? ''
    expect([...nav.matchAll(/<a href="([^"]*)"/g)].map(match => match[1]).slice(0, 2), path).toEqual(['/', '/daily'])
  }

  const pages: [string, string[], number][] = [
    ['/', ['/', '/daily'], 0],
    ['/daily', ['/', '/daily'], 1],
    // A third segment, when there is one, follows the two dailies.
    ['/practice', ['/', '/daily', '/practice'], 2],
    ['/m', ['/', '/daily', '/m'], 2]
  ]
  for (const [path, expected, active] of pages) {
    await page.goto(path)
    await expect(modes(page).getByRole('link')).toHaveCount(expected.length)
    const { links, hrefs, lefts } = await switchOrder(page)
    expect(hrefs, path).toEqual(expected)
    // Left to right on screen, the same order.
    expect(lefts, path).toEqual([...lefts].sort((a, b) => a - b))
    // Only the game being played is marked as the current page.
    for (let i = 0; i < expected.length; i++) {
      if (i === active) await expect(links.nth(i), path).toHaveAttribute('aria-current', 'page')
      else await expect(links.nth(i), path).not.toHaveAttribute('aria-current')
    }
    // Tab moves through them in that order, and back.
    await links.first().focus()
    for (let i = 1; i < expected.length; i++) {
      await page.keyboard.press('Tab')
      await expect(links.nth(i), path).toBeFocused()
    }
    await page.keyboard.press('Shift+Tab')
    await expect(links.nth(expected.length - 2), path).toBeFocused()
  }

  // The active segment follows a switch without the links changing places.
  await page.goto('/')
  await modes(page).getByRole('link', { name: 'Daily Deal', exact: true }).click()
  await expect(page).toHaveURL(/\/daily$/)
  expect((await switchOrder(page)).hrefs).toEqual(['/', '/daily'])
  await expect(modes(page).getByRole('link').nth(1)).toHaveAttribute('aria-current', 'page')
})

test('the stats and archive pages’ switch is in the same order', async ({ page }) => {
  for (const path of ['/stats', '/archive']) {
    const html = await (await page.request.get(path)).text()
    const nav = html.match(/<nav aria-label="Game mode"[^>]*>(.*?)<\/nav>/s)?.[1] ?? ''
    expect([...nav.matchAll(/<a href="([^"]*)"/g)].map(match => match[1]), path).toEqual(['/', '/daily'])
    await page.goto(path)
    const { hrefs, lefts } = await switchOrder(page)
    expect(hrefs, path).toEqual(['/', '/daily'])
    expect(lefts[0], path).toBeLessThan(lefts[1]!)
    // Neither game is this page.
    await expect(modes(page).locator('[aria-current]'), path).toHaveCount(0)
  }
})

test('a crawler finds both dailies from every game page without running the script', async ({ browser, request }) => {
  for (const path of ['/', '/daily', '/puzzle', '/practice', '/m']) {
    const html = await (await request.get(path)).text()
    const nav = html.match(/<nav aria-label="Game mode"[^>]*>(.*?)<\/nav>/s)?.[1] ?? ''
    expect(nav, path).toMatch(/<a href="\/daily"/)
    expect(nav, path).toMatch(/<a href="\/"/)
    expect(nav, path).not.toContain('<button')
  }

  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    const page = await context.newPage()
    await page.goto('/')
    await modes(page).getByRole('link', { name: 'Daily Deal', exact: true }).click()
    await expect(page).toHaveURL(/\/daily$/)
    await expect(page).toHaveTitle(DAILY_TITLE)
    await modes(page).getByRole('link', { name: 'Puzzle', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page).toHaveTitle(SITE_NAME)
  } finally {
    await context.close()
  }
})

test.describe('on a small phone', () => {
  test.use({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true })

  test('the site’s name and the switch fit the header on every game page', async ({ page }) => {
    for (const path of ['/', '/daily', '/practice', '/m']) {
      await page.goto(path)
      await expect(modes(page).getByRole('link').first()).toBeVisible()
      const logo = (await page.getByRole('button', { name: 'Set Daily logo', exact: true }).boundingBox())!
      const nav = (await modes(page).boundingBox())!
      const menu = (await page.getByRole('button', { name: 'Menu', exact: true }).boundingBox())!
      expect(logo.x + logo.width, path).toBeLessThanOrEqual(nav.x)
      expect(nav.x + nav.width, path).toBeLessThanOrEqual(menu.x)
      expect(menu.x + menu.width, path).toBeLessThanOrEqual(320)
      // One row, and no segment's label is cut off.
      expect(Math.abs(logo.y + logo.height / 2 - (nav.y + nav.height / 2)), path).toBeLessThan(4)
      expect(await modes(page).evaluate(node => node.scrollWidth <= node.clientWidth), path).toBe(true)
      const { hrefs, lefts } = await switchOrder(page)
      expect(hrefs.slice(0, 2), path).toEqual(['/', '/daily'])
      expect(lefts, path).toEqual([...lefts].sort((a, b) => a - b))
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), path).toBe(true)
    }
    // With two segments the name is spelled out, even here.
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Set Daily logo', exact: true })).toHaveText('Set Daily')
  })
})

test('once today’s deal is played, the result card’s heading sits under the page’s one main heading', async ({ page }) => {
  // Today's try already used (as on another device): the page is the result card, not the game.
  await page.route('**/api/daily', async route => {
    const response = await route.fetch()
    const status = await response.json()
    await route.fulfill({ response, json: { ...status, me: { ...status.me, attempted: true } } })
  })
  await page.goto('/daily')
  const card = page.getByRole('region', { name: /^Daily Deal #\d+$/ })
  await expect(card).toBeVisible()
  await expect(card.getByRole('heading', { level: 2, name: /^Daily Deal #\d+$/ })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(DAILY_HEADING)
})
