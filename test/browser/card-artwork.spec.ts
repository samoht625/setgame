import { test, expect } from '@playwright/test'
import { describeCard } from '../../app/javascript/components/CardFace'

for (const { width, height, colorScheme } of [
  { width: 1440, height: 1000, colorScheme: 'light' as const },
  { width: 375, height: 812, colorScheme: 'dark' as const }
]) {
  test(`gallery artwork stays complete and unclipped at ${width}px in ${colorScheme} mode`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ colorScheme })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/gallery')
    await expect(page.getByRole('heading', { name: 'Card gallery' })).toBeVisible()
    const articles = page.locator('article')
    await expect(articles).toHaveCount(81)
    await expect(articles.locator('svg[role="img"]')).toHaveCount(81)
    expect(await articles.locator('svg[role="img"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))))
      .toEqual(Array.from({ length: 81 }, (_, index) => describeCard(index + 1)))
    expect(await articles.locator('svg use').evaluateAll(nodes => nodes.every(node => {
      const use = node as SVGUseElement
      const bounds = use.getBBox()
      const transform = use.transform.baseVal.consolidate()!.matrix
      const left = bounds.x + transform.e
      const top = bounds.y + transform.f
      return bounds.width > 0 && bounds.height > 0 && left > 3 && top > 3 && left + bounds.width < 255 && top + bounds.height < 164
    }))).toBe(true)

    for (const cardId of [1, 3, 28, 30, 55, 57, 81]) {
      const article = articles.nth(cardId - 1)
      await article.scrollIntoViewIfNeeded()
      await expect(article.getByRole('img', { name: describeCard(cardId), exact: true })).toBeVisible()
      await expect.poll(() => article.locator('img').evaluate(image => image.complete && image.naturalWidth === 258)).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await articles.nth(54).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `tmp/gallery-${colorScheme}-${width}.png` })
    await page.getByRole('link', { name: '← Set' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('[data-card-id]').first()).toBeEnabled()
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Card gallery' })).toBeVisible()
    await expect(page.locator('#set-card-squiggle')).toHaveCount(1)
    expect(errors).toEqual([])
  })
}
