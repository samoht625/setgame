import { test, expect, type Page } from '@playwright/test'

// Everything in the header shares one centre line: the wordmark, its three
// dots, the Puzzle / Daily Deal switch and the menu button. The row centres
// their boxes; the letters are checked as painted too, because a font can
// sit its letters high or low inside a centred box (Header.tsx boxes its
// text by the capitals so it can't).
const PAGES = ['/', '/puzzle', '/daily', '/practice', '/m', '/archive', '/stats', '/blog', '/blog/spotting-sets']
// Screenshots this many times finer than a CSS pixel, to place the letters.
const SCALE = 4

type Box = { x: number; y: number; width: number; height: number }

/** A past Puzzle's page and a past Daily Deal's, when the archive lists one. */
async function archivedDays(page: Page): Promise<string[]> {
  await page.goto('/archive')
  return page.evaluate(() => ['puzzle', 'daily']
    .map(kind => document.querySelector(`a[data-archive-tile^="${kind}:"]`)?.getAttribute('href'))
    .filter((href): href is string => !!href))
}

/** The vertical centre of each header item on the page, in CSS pixels: its box's, and for text its first letter's (a capital) as painted. */
async function centres(page: Page, reader: Page): Promise<Record<string, number>> {
  const found = await page.evaluate(() => {
    const centre = (element: Element) => {
      const box = element.getBoundingClientRect()
      return box.top + box.height / 2
    }
    // Not display: none, and not the 1px box of text kept for screen readers.
    const shown = (element: Element) => {
      const box = element.getBoundingClientRect()
      return box.width > 2 && box.height > 2
    }
    const firstLetter = (element: Element) => {
      const text = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE)!
      const range = document.createRange()
      range.setStart(text, 0)
      range.setEnd(text, 1)
      const box = range.getBoundingClientRect()
      return { x: Math.floor(box.left), y: Math.floor(box.top), width: Math.ceil(box.width), height: Math.ceil(box.height) }
    }

    const nav = document.querySelector('header nav[aria-label="Game mode"]')!
    const row = nav.closest('header')!.firstElementChild!
    const logo = row.firstElementChild!
    const [word, dots] = [...logo.children]
    const menu = row.querySelector('button[aria-label="Menu"]')!
    const boxes: Record<string, number> = { switch: centre(nav), 'menu button': centre(menu) }
    const letters: Record<string, { x: number; y: number; width: number; height: number }> = {}
    if (shown(word!)) {
      boxes.wordmark = centre(word!)
      letters[`“${word!.textContent}” lettering`] = firstLetter(word!)
    }
    if (shown(dots!)) boxes.dots = centre(dots!)
    for (const link of nav.querySelectorAll('a')) {
      const label = [...link.querySelectorAll('span')].find(shown) ?? link
      boxes[`“${label.textContent}” segment`] = centre(link)
      letters[`“${label.textContent}” lettering`] = firstLetter(label)
    }
    const around = row.getBoundingClientRect()
    return { boxes, letters, row: { x: 0, y: Math.floor(around.top), width: document.documentElement.clientWidth, height: Math.ceil(around.height) } }
  })

  const shot = (await page.screenshot({ clip: found.row })).toString('base64')
  // Read back on a blank page, so the page under test and its content policy have no say in it.
  const painted = await reader.evaluate(async ({ shot, letters, row, scale }: { shot: string; letters: Record<string, Box>; row: Box; scale: number }) => {
    const image = await createImageBitmap(new Blob([Uint8Array.from(atob(shot), character => character.charCodeAt(0))], { type: 'image/png' }))
    const canvas = new OffscreenCanvas(image.width, image.height)
    const drawing = canvas.getContext('2d')!
    drawing.drawImage(image, 0, 0)
    const pixels = drawing.getImageData(0, 0, image.width, image.height).data
    const brightness = (x: number, y: number) => {
      const at = (image.width * y + x) * 4
      return pixels[at]! + pixels[at + 1]! + pixels[at + 2]!
    }
    const result: Record<string, number> = {}
    for (const [name, box] of Object.entries(letters)) {
      const [left, right] = [(box.x - row.x) * scale, (box.x - row.x + box.width) * scale]
      const [top, bottom] = [Math.max(0, (box.y - row.y) * scale), Math.min(image.height, (box.y - row.y + box.height) * scale)]
      // The letter's box starts above the letter, so its corner is the colour behind it.
      const behind = brightness(left, top)
      let contrast = 0
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) contrast = Math.max(contrast, Math.abs(brightness(x, y) - behind))
      const inked: number[] = []
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          if (Math.abs(brightness(x, y) - behind) > contrast / 2) {
            inked.push(y)
            break
          }
        }
      }
      result[name] = contrast > 0 ? row.y + (inked[0]! + inked[inked.length - 1]! + 1) / 2 / scale : NaN
    }
    return result
  }, { shot, letters: found.letters, row: found.row, scale: SCALE })

  return { ...found.boxes, ...painted }
}

for (const [device, viewport] of [['a desktop', { width: 1280, height: 800 }], ['a phone', { width: 390, height: 844 }]] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`on ${device}, ${colorScheme}`, () => {
      test.use({ viewport, colorScheme, deviceScaleFactor: SCALE })

      test('the wordmark, the switch and the menu button share one centre line on every page with the header', async ({ page, context }) => {
        const paths = [...PAGES, ...await archivedDays(page)]
        const reader = await context.newPage()

        for (const path of paths) {
          await page.goto(path)
          await expect(page.getByRole('navigation', { name: 'Game mode' }).getByRole('link').first()).toBeVisible()
          await expect(page.getByRole('button', { name: 'Menu', exact: true })).toBeVisible()

          const found = await centres(page, reader)
          const names = Object.keys(found)
          expect(names.some(name => name === 'wordmark' || name === 'dots'), `${path}: the logo shows its name or its dots`).toBe(true)
          expect(names.filter(name => name.endsWith('lettering')).length, `${path}: the wordmark's and the labels' letters were found`).toBeGreaterThanOrEqual(2)

          const line = found.switch!
          for (const [name, centre] of Object.entries(found)) {
            expect(Math.abs(centre - line), `${path}: the ${name} is ${(centre - line).toFixed(2)}px off the switch's centre line`).toBeLessThanOrEqual(1)
          }
          const values = Object.values(found)
          expect(Math.max(...values) - Math.min(...values), `${path}: ${JSON.stringify(found)}`).toBeLessThanOrEqual(1)
        }
      })
    })
  }
}
