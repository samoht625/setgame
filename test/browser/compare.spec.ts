import { test, expect, type Page } from '@playwright/test'
import { isSet } from '../../app/javascript/lib/rules'
import { applySoloClaim, isRoundOver, startSoloDeal } from '../../app/javascript/lib/solo_deal'

const SAVE_KEY = 'setgame_daily_v1'
const ME = '0b0b0b0b-1111-4222-8333-555555555555'
const SEED = 20261005

type Claim = { cards: number[]; t_ms: number }

function today() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

/**
 * Really plays the deal out: each turn takes the set at `pick` among those on the board,
 * at uneven gaps scaled so the last claim lands at `finishMs`.
 */
function playOut(seed: number, pick: (sets: number[][]) => number[], finishMs: number, jitter: number): Claim[] {
  const deal = startSoloDeal(seed)
  const picks: number[][] = []
  while (!isRoundOver(deal)) {
    const b = deal.board
    const sets: number[][] = []
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) for (let k = j + 1; k < b.length; k++) {
      if (isSet(b[i]!, b[j]!, b[k]!)) sets.push([b[i]!, b[j]!, b[k]!].sort((x, y) => x - y))
    }
    const cards = pick(sets)
    applySoloClaim(deal, cards)
    picks.push(cards)
  }
  let state = jitter
  const gaps = picks.map(() => {
    state = (state * 1103515245 + 12345) % 2 ** 31
    return 0.4 + (state / 2 ** 31) * 1.6
  })
  const total = gaps.reduce((sum, gap) => sum + gap, 0)
  let at = 0
  return picks.map((cards, index) => {
    at += gaps[index]!
    return { cards, t_ms: Math.round((at / total) * finishMs) }
  })
}

const mine = playOut(SEED, sets => sets[0]!, 96_000, 7)
const runs: Record<string, { name: string | null; claims: Claim[] }> = {
  p1: { name: 'Maya', claims: playOut(SEED, sets => sets[sets.length - 1]!, 71_000, 3) },
  p2: { name: 'Jonah', claims: playOut(SEED, sets => sets[Math.floor(sets.length / 2)]!, 84_000, 11) },
  p4: { name: 'Priya', claims: playOut(SEED, sets => sets[0]!, 128_000, 5) }
}

const setsBy = (claims: Claim[], t: number) => claims.filter(claim => claim.t_ms <= t).length

/** A finished, submitted run for today and a made-up leaderboard around it. Returns the compare requests made. */
async function finished(page: Page, { myResult = true, myReplay = true } = {}) {
  const date = today()
  await page.addInitScript(id => localStorage.setItem('setgame_player_id', id), ME)
  const entry = (player_id: string, display_name: string | null, elapsed_ms: number, replay: boolean) =>
    ({ player_id, display_name, elapsed_ms, misses: 0, completed_at: new Date().toISOString(), replay })
  await page.route('**/api/daily', route => route.fulfill({
    json: {
      date,
      number: 12,
      next_at: new Date(Date.now() + 5 * 3600_000).toISOString(),
      total: 5,
      leaderboard: [
        entry('p1', 'Maya', 71_000, true),
        entry('p2', 'Jonah', 84_000, true),
        entry(ME, 'Tido', 96_000, myReplay),
        entry('p3', null, 103_000, false),
        entry('p4', 'Priya', 128_000, true)
      ],
      me: {
        attempted: true,
        streak: 3,
        result: myResult ? { display_name: 'Tido', elapsed_ms: 96_000, misses: 0, rank: 3, total: 5, share_token: 'x', replay: myReplay } : null
      }
    }
  }))
  const requests: URLSearchParams[] = []
  await page.route('**/api/daily/compare?*', route => {
    const params = new URL(route.request().url()).searchParams
    requests.push(params)
    const id = params.get('player_id')!
    const them = runs[id]
    if (!them) return route.fulfill({ status: 404, json: { error: 'not_found' } })
    const rank = { p1: 1, p2: 2, p4: 5 }[id]
    return route.fulfill({
      json: {
        date,
        number: 12,
        seed: SEED,
        me: { display_name: 'Tido', elapsed_ms: 96_000, rank: 3, claims: mine },
        them: { display_name: them.name, elapsed_ms: them.claims[them.claims.length - 1]!.t_ms, rank, claims: them.claims }
      }
    })
  })
  if (myResult) {
    await page.addInitScript(({ key, date, claims }) => {
      localStorage.setItem(key, JSON.stringify({
        ranked: {
          date, number: 12, gameId: 'my-game', seed: 1, board: [], deck: [], rngState: 0, status: 'finished',
          startedAtMs: Date.now() - 200_000, elapsedMs: 96_000, events: claims.map(c => ({ type: 'claim', ...c })), misses: 0, submission: 'submitted'
        }
      }))
    }, { key: SAVE_KEY, date, claims: mine })
  }
  return requests
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

const boardCards = (page: Page, label: string) =>
  page.getByRole('img', { name: new RegExp(`^${label}:`) }).locator('[data-replay-card]').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-replay-card'))))

async function scrubTo(page: Page, ms: number) {
  await page.getByRole('slider', { name: 'Replay time' }).fill(String(ms))
}

test('other finishers get a small vs control; the player’s own row and rows without timing don’t', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 })
  await finished(page)
  await page.goto('/daily')
  const card = page.getByRole('region', { name: 'Set Daily #12' })
  const compareButtons = card.getByRole('button', { name: /^Compare with / })
  await expect(compareButtons).toHaveCount(3)
  await expect(compareButtons).toHaveText(['vs', 'vs', 'vs'])
  await expect(card.getByRole('button', { name: 'Compare with Maya' })).toBeVisible()
  await expect(card.getByRole('button', { name: 'Compare with Anonymous' })).toHaveCount(0)
  await expect(card.locator('li[aria-current="true"]').getByRole('button')).toHaveCount(0)

  // Times stay in one column with or without the control, and rows don't grow.
  const rows = card.locator('ol > li:not([aria-hidden])')
  const rights = await rows.evaluateAll(items => items.map(item => item.querySelector('.flex-col > span')!.getBoundingClientRect().right))
  expect(Math.max(...rights) - Math.min(...rights)).toBeLessThan(1)
  const heights = await rows.evaluateAll(items => items.map(item => item.getBoundingClientRect().height))
  expect(Math.max(...heights)).toBeLessThanOrEqual(33)
  await noOverflow(page)
  await card.screenshot({ path: 'tmp/compare-leaderboard-mobile.png' })
})

test('no compare before the player has a finished run with timing of their own', async ({ page }) => {
  await finished(page, { myResult: false })
  await page.goto('/daily')
  await expect(page.getByText('You’ve used today’s try.')).toBeVisible()
  await expect(page.getByText('Maya')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Compare with / })).toHaveCount(0)
})

test('no compare when the player’s own run has no timing', async ({ page }) => {
  await finished(page, { myReplay: false })
  await page.goto('/daily')
  await expect(page.getByText('Maya')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Compare with / })).toHaveCount(0)
})

for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['mobile', { width: 375, height: 812 }]] as const) {
  test(`compare replays both runs side by side on a shared timeline (${label})`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const requests = await finished(page)
    await page.goto('/daily')
    await page.getByRole('button', { name: 'Compare with Maya' }).click()

    const dialog = page.getByRole('dialog', { name: 'You vs Maya' })
    await expect(dialog).toBeVisible()
    expect(requests.map(params => Object.fromEntries(params))).toEqual([{ date: today(), player_id: 'p1' }])
    const maya = runs.p1!.claims

    // Same deal: the boards start out identical.
    await expect(dialog.getByTestId('replay-score')).toHaveText('0–0')
    await expect(dialog.getByTestId('replay-clock')).toHaveText('0:00')
    const opening = startSoloDeal(SEED).board
    expect(await boardCards(page, 'Your board')).toEqual(opening)
    expect(await boardCards(page, 'Maya’s board')).toEqual(opening)
    await expect(dialog.getByText('1:36 · 3rd')).toBeVisible()
    await expect(dialog.getByText('1:11 · 1st')).toBeVisible()

    // Every set is on the timeline, one lane each.
    await expect(dialog.locator('[data-claim="me"]')).toHaveCount(mine.length)
    await expect(dialog.locator('[data-claim="them"]')).toHaveCount(maya.length)

    // The arrow keys step set by set, across both lanes. Landing on a claim shows
    // the set that was taken, on the board it came from.
    const third = mine[2]!
    const moments = [...new Set([...mine, ...maya].map(claim => claim.t_ms))].sort((a, b) => a - b)
    const slider = dialog.getByRole('slider', { name: 'Replay time' })
    await slider.focus()
    await slider.press('ArrowRight')
    await expect(slider).toHaveAttribute('aria-valuetext', new RegExp(`^0:0${Math.floor(moments[0]! / 1000)}: `))
    for (let i = 1; i <= moments.indexOf(third.t_ms); i++) await slider.press('ArrowRight')
    await slider.press('ArrowRight')
    await slider.press('ArrowLeft')
    const found = page.getByRole('img', { name: /^Your board:/ }).locator('[data-found="true"]')
    await expect(found).toHaveCount(3)
    expect((await found.evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-replay-card'))))).sort((a, b) => a - b)).toEqual(third.cards)
    await expect(dialog.getByTestId('replay-score')).toHaveText(`3–${setsBy(maya, third.t_ms)}`)

    // Partway through, each board has moved on through its own sets.
    const mid = 45_000
    await scrubTo(page, mid)
    await expect(dialog.getByTestId('replay-score')).toHaveText(`${setsBy(mine, mid)}–${setsBy(maya, mid)}`)
    await expect(dialog.getByTestId('replay-clock')).toHaveText('0:45')
    expect(await boardCards(page, 'Your board')).not.toEqual(await boardCards(page, 'Maya’s board'))
    await expect(dialog.getByText(/^Done · /)).toHaveCount(0)
    await noOverflow(page)
    const box = (await dialog.locator(':scope > div').boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    await slider.blur()
    await page.screenshot({ path: `tmp/compare-dialog-${label}.png` })
    await dialog.getByTestId('replay-timeline').screenshot({ path: `tmp/compare-timeline-${label}.png` })

    // Maya finished first, and was ahead from then on.
    await scrubTo(page, 80_000)
    await expect(dialog.getByText('Done · 1:11')).toBeVisible()
    await expect(dialog.getByTestId('replay-score')).toHaveText(`${setsBy(mine, 80_000)}–${maya.length}`)
    await scrubTo(page, 96_000)
    await expect(dialog.getByText('Done · 1:36')).toBeVisible()
    await expect(dialog.locator('[data-lead]').last()).toHaveAttribute('data-lead', 'them')

    // Play runs the clock from the start again; pause stops it.
    await dialog.getByRole('button', { name: 'Play replay' }).click()
    await expect(dialog.getByRole('button', { name: 'Pause replay' })).toBeVisible()
    await expect(dialog.getByTestId('replay-clock')).not.toHaveText('0:00')
    await dialog.getByRole('button', { name: 'Pause replay' }).click()
    const paused = await dialog.getByTestId('replay-clock').innerText()
    await page.waitForTimeout(400)
    await expect(dialog.getByTestId('replay-clock')).toHaveText(paused)

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await page.getByRole('button', { name: 'Compare with Jonah' }).click()
    await expect(page.getByRole('dialog', { name: 'You vs Jonah' })).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(errors).toEqual([])
  })
}

test('the replay plays itself when motion is welcome', async ({ page }) => {
  await finished(page)
  await page.goto('/daily')
  await page.getByRole('button', { name: 'Compare with Priya' }).click()
  const dialog = page.getByRole('dialog', { name: 'You vs Priya' })
  await expect(dialog.getByRole('button', { name: 'Pause replay' })).toBeVisible()
  await expect(dialog.getByText('Same deal, replayed at 6× speed')).toBeVisible()
  await expect.poll(() => dialog.getByTestId('replay-score').innerText()).not.toBe('0–0')
})

test('a replay that fails to load can be retried', async ({ page }) => {
  await finished(page)
  let fail = true
  await page.route('**/api/daily/compare?*', route => (fail ? route.fulfill({ status: 503, json: { error: 'down' } }) : route.fallback()))
  await page.goto('/daily')
  await page.getByRole('button', { name: 'Compare with Maya' }).click()
  const dialog = page.getByRole('dialog', { name: 'You vs Maya' })
  await expect(dialog.getByText('Couldn’t load this replay.')).toBeVisible()
  fail = false
  await dialog.getByRole('button', { name: 'Try again' }).click()
  await expect(dialog.getByTestId('replay-score')).toBeVisible()
})

test('end to end: two finishers compare; a player still mid-deal can’t see anyone’s claims', async ({ page, request }) => {
  test.setTimeout(120_000)
  const players = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]
  const [me, rival, midGame] = players.map(id => ({ 'X-Player-Id': id }))
  const starts = await Promise.all([me, rival, midGame].map(async headers => (await request.post('/api/daily/games', { headers })).json()))
  expect(starts.map(start => start.game_id)).toEqual([expect.any(String), expect.any(String), expect.any(String)])
  const seed = starts[0].seed as number

  // The server refuses runs under 30 seconds of wall clock.
  await page.waitForTimeout(31_000)
  const rivalName = `Rival ${Math.floor(Math.random() * 9000 + 1000)}`
  const submit = async (headers: Record<string, string>, gameId: string, claims: Claim[], name: string) => {
    const res = await request.post('/api/solo/scores', {
      headers,
      data: { game_id: gameId, elapsed_ms: claims[claims.length - 1]!.t_ms, events: claims.map(c => ({ type: 'claim', ...c })), misses: 0, display_name: name }
    })
    expect(res.status(), await res.text()).toBe(200)
  }
  const myClaims = playOut(seed, sets => sets[0]!, 30_600, 2)
  const rivalClaims = playOut(seed, sets => sets[sets.length - 1]!, 30_100, 9)
  await submit(me, starts[0].game_id, myClaims, 'E2E Me')
  await submit(rival, starts[1].game_id, rivalClaims, rivalName)

  const peek = await request.get(`/api/daily/compare?player_id=${players[1]}`, { headers: midGame })
  expect(peek.status()).toBe(403)
  expect(await peek.text()).not.toContain('claims')

  await page.addInitScript(id => localStorage.setItem('setgame_player_id', id), players[0]!)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/daily')
  await page.getByRole('button', { name: `Compare with ${rivalName}` }).click()
  const dialog = page.getByRole('dialog', { name: `You vs ${rivalName}` })
  await expect(dialog.locator('[data-claim="me"]')).toHaveCount(myClaims.length)
  await expect(dialog.locator('[data-claim="them"]')).toHaveCount(rivalClaims.length)
  expect(await boardCards(page, 'Your board')).toEqual(startSoloDeal(seed).board)
  await scrubTo(page, 30_600)
  await expect(dialog.getByTestId('replay-score')).toHaveText(`${myClaims.length}–${rivalClaims.length}`)
  await expect(dialog.getByText('Done · 0:30')).toHaveCount(2)
})
