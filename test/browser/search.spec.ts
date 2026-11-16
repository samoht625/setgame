import { test, expect, type Page } from '@playwright/test'

// What the front door and the Puzzle page tell search engines. The same strings
// are in app/views/home (served) and App.tsx (the tab title after a switch).
const HOME_HEADING = 'Daily Set Puzzle: find 6 sets in 12 cards, or clear the deck'
const HOME_TITLE = `${HOME_HEADING} | Set Daily`
const PUZZLE_HEADING = 'Today’s Set Puzzle: 12 cards, 6 sets, one try'
const PUZZLE_TITLE = `${PUZZLE_HEADING} | Set Daily`

/** The tags a search engine or a link preview reads from the page. */
async function headTags(page: Page) {
  return page.evaluate(() => {
    const content = (selector: string) => document.querySelector(selector)?.getAttribute('content') ?? null
    return {
      description: content('meta[name="description"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
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

test('the front door leads with the daily Set puzzle for search and still opens the Daily Deal', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(HOME_TITLE)
  const tags = await headTags(page)
  expect(tags.ogTitle).toBe(HOME_TITLE)
  expect(tags.twitterTitle).toBe(HOME_TITLE)
  // Honest about what opens: both dailies are named, the Puzzle first.
  expect(tags.description).toBe('Play the daily Set puzzle free: find all 6 sets in 12 cards, or clear the whole deck in the Daily Deal. Same cards for everyone, new at midnight Pacific. No signup.')
  expect(tags.ogDescription).toBe(tags.description)
  expect(tags.twitterDescription).toBe(tags.description)
  expect(tags.canonical).toBe('https://setdaily.app/')
  expect(tags.ogUrl).toBe('https://setdaily.app/')
  await expectHiddenMainHeading(page, HOME_HEADING)

  // The game is the Daily Deal, as before, with the Puzzle the title promises one tap away.
  await expect(page.getByRole('button', { name: 'Daily Deal', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/^Daily Deal #\d+$/).first()).toBeVisible()
  await expect(page.getByText('Same deal for everyone today.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Puzzle', exact: true }).click()
  await expect(page).toHaveURL(/\/puzzle$/)
  await expect(page.getByText('12 cards. 6 sets. Find them all.')).toBeVisible()
})

test('the front door’s structured data parses and says only what is true of the site', async ({ page }) => {
  await page.goto('/')
  const tags = await headTags(page)
  expect(tags.structuredData).toHaveLength(1)
  const data = JSON.parse(tags.structuredData[0]!)
  expect(data['@context']).toBe('https://schema.org')
  const [site, game] = data['@graph']
  expect(data['@graph']).toHaveLength(2)
  expect(site).toEqual({ '@type': 'WebSite', '@id': 'https://setdaily.app/#website', name: 'Set Daily', alternateName: 'Set', url: 'https://setdaily.app/', inLanguage: 'en' })
  expect(game).toMatchObject({
    '@type': ['VideoGame', 'WebApplication'],
    name: 'Set Daily',
    url: 'https://setdaily.app/',
    description: tags.description,
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

test('the Puzzle page says what that one game is and leaves the daily Set puzzle search to the front door', async ({ page }) => {
  await page.goto('/puzzle')
  await expect(page).toHaveTitle(PUZZLE_TITLE)
  const tags = await headTags(page)
  expect(tags.ogTitle).toBe(PUZZLE_TITLE)
  expect(tags.twitterTitle).toBe(PUZZLE_TITLE)
  expect(tags.description).toBe('Today’s Set Puzzle: 12 cards hold exactly 6 sets. Find all 6 in one try and see how your time ranks. A new puzzle every midnight Pacific. Free, no signup.')
  expect(tags.ogDescription).toBe(tags.description)
  expect(tags.canonical).toBe('https://setdaily.app/puzzle')
  for (const text of [PUZZLE_TITLE, tags.description!]) expect(text).not.toMatch(/daily set puzzle/i)
  expect(tags.structuredData).toHaveLength(0)
  await expectHiddenMainHeading(page, PUZZLE_HEADING)
  await expect(page.getByRole('button', { name: 'Puzzle', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/^Puzzle #\d+$/).first()).toBeVisible()
})

test('the tab title after switching games is the one that game’s page is served with', async ({ page, request }) => {
  const served = async (path: string) => (await (await request.get(path)).text()).match(/<title>(.*?)<\/title>/)![1]!
  expect(await served('/')).toBe(HOME_TITLE)
  expect(await served('/daily')).toBe(HOME_TITLE)
  expect(await served('/puzzle')).toBe(PUZZLE_TITLE)

  await page.goto('/')
  await expect(page).toHaveTitle(HOME_TITLE)
  await page.getByRole('button', { name: 'Puzzle', exact: true }).click()
  await expect(page).toHaveTitle(PUZZLE_TITLE)
  await page.getByRole('button', { name: 'Daily Deal', exact: true }).click()
  await expect(page).toHaveTitle(HOME_TITLE)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Practice', exact: true }).click()
  await expect(page).toHaveTitle(await served('/practice'))
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('menuitem', { name: /^Multiplayer/ }).click()
  await expect(page).toHaveTitle(await served('/m'))
})

test('once today’s deal is played, the result card’s heading sits under the page’s one main heading', async ({ page }) => {
  // Today's try already used (as on another device): the page is the result card, not the game.
  await page.route('**/api/daily', async route => {
    const response = await route.fetch()
    const status = await response.json()
    await route.fulfill({ response, json: { ...status, me: { ...status.me, attempted: true } } })
  })
  await page.goto('/')
  const card = page.getByRole('region', { name: /^Daily Deal #\d+$/ })
  await expect(card).toBeVisible()
  await expect(card.getByRole('heading', { level: 2, name: /^Daily Deal #\d+$/ })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HOME_HEADING)
})
