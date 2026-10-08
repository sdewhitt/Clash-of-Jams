import { skillRatingsPath } from '../../../src/lib/schema/collections.js'
import { signIn, signOut } from '../support/auth.js'
import { TEST_ENV } from '../support/environment.js'
import { test, expect } from '../support/fixtures.js'
import { prepareResult, rating } from './data.js'

test('both players receive live Elo and duplicate completion applies once', async ({
  page,
  browser,
  data,
  player,
  opponent,
}, testInfo) => {
  await signIn(page, player)
  const otherContext = await browser.newContext({ baseURL: TEST_ENV.baseURL })
  try {
    const otherPage = await otherContext.newPage()
    await signIn(otherPage, opponent)
    const badge = page.getByRole('button', { name: 'View piano Elo details' })
    const otherBadge = otherPage.getByRole('button', { name: 'View piano Elo details' })
    await expect(badge).toContainText('Piano-400')
    await expect(otherBadge).toContainText('Piano-400')
    const result = await prepareResult(data, player, opponent)
    const first = await result.apply()
    await expect(badge).toContainText('Piano-416')
    await expect(otherBadge).toContainText('Piano-384')
    expect(await result.apply()).toEqual(first)
    await badge.click()
    await expect(page.getByRole('region', { name: 'Elo details' })).toContainText('1 rated matches')
    await badge.click()
    await page.getByRole('button', { name: 'Recent Matches', exact: true }).click()
    await expect(page.getByRole('article')).toHaveCount(1)
    await testInfo.attach('persisted-rating-history', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
    expect((await rating(data, player))?.gamesPlayed).toBe(1)
    await page.reload()
    await expect(page.getByRole('region', { name: 'Instrument rating' })).toContainText('Piano-416')
    await expect(page.getByRole('article')).toHaveCount(1)
  } finally {
    await otherContext.close()
  }
})

const outcomes = [
  { result: 'win', label: 'Win', elo: '416', delta: '+16' },
  { result: 'loss', label: 'Loss', elo: '384', delta: '-16' },
  { result: 'draw', label: 'Draw', elo: '400', delta: '0' },
  { result: 'resign', label: 'Forfeit', elo: '384', delta: '-16' },
  { result: 'disconnect', label: 'Forfeit', elo: '384', delta: '-16' },
] as const

for (const outcome of outcomes) {
  test('live history explains ' + outcome.result, async ({ page, data, player, opponent }) => {
    await signIn(page, player, '/recent_matches')
    await expect(page.getByText('No previous matches.', { exact: false })).toBeVisible()
    await (await prepareResult(data, player, opponent, outcome.result)).apply()
    const card = page.getByRole('article')
    await expect(card).toHaveCount(1)
    await expect(card.getByRole('heading', { name: outcome.label, exact: true })).toBeVisible()
    await expect(card.getByLabel('Rating change')).toHaveText(
      '400 → ' + outcome.elo + ' (' + outcome.delta + ')',
    )
    await expect(card.getByText('50%', { exact: true })).toBeVisible()
    await expect(card.getByText('32', { exact: true })).toBeVisible()
    if (outcome.result === 'resign') await expect(card).toContainText('Decided by resignation.')
    if (outcome.result === 'disconnect') {
      await expect(card).toContainText('Decided by disconnect forfeit.')
    }
    if (outcome.result === 'win') {
      await expect(card.getByText('90%', { exact: true })).toBeVisible()
      await expect(card.getByText('70%', { exact: true })).toBeVisible()
    }
  })
}

test('instrument selection isolates history and preferred-instrument changes reach Home', async ({
  page,
  data,
  player,
  opponent,
}) => {
  await (await prepareResult(data, player, opponent)).apply()
  await signIn(page, player, '/recent_matches')
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.getByRole('combobox', { name: 'Instrument' }).selectOption('guitar')
  await expect(page.getByRole('region', { name: 'Instrument rating' })).toContainText('Guitar-400')
  await expect(page.getByRole('article')).toHaveCount(0)
  await expect(page.getByText('No previous matches.', { exact: false })).toBeVisible()
  await page.getByRole('combobox', { name: 'Instrument' }).selectOption('piano')
  await expect(page.getByRole('article')).toHaveCount(1)
  await page.goto('/home')
  await data.update('userSettings/' + player.uid, { preferredInstrument: 'guitar' })
  await expect(page.getByRole('button', { name: 'View guitar Elo details' })).toContainText(
    'Guitar-400',
  )
})

test('Home Elo dropdown saves its instrument across reloads and opens separate recent matches', async ({
  page,
  data,
  player,
}, testInfo) => {
  await signIn(page, player)
  await page.getByRole('button', { name: 'View piano Elo details' }).click()
  const details = page.getByRole('region', { name: 'Elo details' })
  await expect(details).toContainText('Beating a stronger opponent earns more points.')
  await details.getByRole('combobox', { name: 'Instrument' }).selectOption('guitar')
  await expect(page.getByRole('button', { name: 'View guitar Elo details' })).toContainText(
    'Guitar-400',
  )
  await expect(details.getByRole('combobox')).toBeEnabled()
  expect((await data.read('userSettings/' + player.uid))?.preferredInstrument).toBe('guitar')
  await page.reload()
  await page.getByRole('button', { name: 'View guitar Elo details' }).click()
  await expect(details.getByRole('combobox')).toHaveValue('guitar')
  const box = await details.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  await testInfo.attach('elo-dropdown', { body: await page.screenshot(), contentType: 'image/png' })
  await page.keyboard.press('Escape')
  await expect(details).not.toBeVisible()
  await page.getByRole('button', { name: 'Recent Matches', exact: true }).click()
  await expect(page).toHaveURL(/\/recent_matches$/)
  await expect(page.getByRole('heading', { name: 'Recent Matches', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Instrument' })).toHaveValue('guitar')
})

test('switching accounts never reveals the previous player history', async ({
  page,
  data,
  player,
  opponent,
}) => {
  await (await prepareResult(data, player, opponent)).apply()
  const newcomer = await data.createPlayer('New Player')
  await signIn(page, player, '/recent_matches')
  await expect(page.getByRole('heading', { name: 'Win', exact: true })).toBeVisible()
  await signOut(page)
  await signIn(page, newcomer, '/recent_matches')
  await expect(page.getByRole('article')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Instrument rating' })).toContainText('Piano-400')
  await expect(page.getByText('No previous matches.', { exact: false })).toBeVisible()
})

test('a missing rating is shown explicitly instead of inventing a score', async ({
  page,
  data,
  player,
}) => {
  await data.remove(skillRatingsPath(player.uid) + '/piano')
  await signIn(page, player)
  await expect(page.getByRole('button', { name: 'View piano Elo details' })).toContainText(
    'No rating yet',
  )
  await page.getByRole('button', { name: 'View piano Elo details' }).click()
  await expect(page.getByText('No rating for this instrument yet.', { exact: true })).toBeVisible()
})

test('history is newest-first, capped at 20, and provisional status matures', async ({
  page,
  data,
  player,
  opponent,
}) => {
  for (let i = 0; i < 21; i++) {
    await (await prepareResult(data, player, opponent, 'draw')).apply()
  }
  await signIn(page, player, '/recent_matches')
  const cards = page.getByRole('article')
  await expect(cards).toHaveCount(20)
  await expect(cards.first()).toContainText('21 rated matches · Established')
  await expect(cards.last()).toContainText('2 rated matches · Provisional')
  await expect(page.getByRole('region', { name: 'Instrument rating' })).toContainText(
    '21 rated matches · Established',
  )
  expect((await rating(data, player))?.gamesPlayed).toBe(21)
})

test('an open profile receives a rating update without a reload', async ({
  page,
  data,
  player,
  opponent,
}) => {
  await signIn(page, player, '/profile')
  const elos = page.locator('#elos')
  await expect(elos).toContainText('Piano-400')
  await (await prepareResult(data, player, opponent)).apply()
  await expect(elos).toContainText('Piano-416')
})

test('a temporary network interruption catches up on reconnect', async ({
  page,
  context,
  data,
  player,
  opponent,
}) => {
  await signIn(page, player)
  const badge = page.getByRole('button', { name: 'View piano Elo details' })
  await expect(badge).toContainText('Piano-400')
  const result = await prepareResult(data, player, opponent)
  await context.setOffline(true)
  try {
    await result.apply()
    await expect(badge).toContainText('Piano-400')
  } finally {
    await context.setOffline(false)
  }
  await expect(badge).toContainText('Piano-416', { timeout: 30_000 })
})
