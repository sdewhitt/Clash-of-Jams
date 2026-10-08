import { signIn, signOut } from './support/auth.js'
import { test, expect } from './support/fixtures.js'
import { TEST_ENV } from './support/environment.js'

for (const destination of ['/home', '/ratings', '/profile', '/scenario_editor']) {
  test('signed-out access to ' + destination + ' returns to login', async ({ page }) => {
    await page.goto(destination)
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
  })
}

test('real login rejects wrong credentials and restores the requested route', async ({
  page,
  player,
}) => {
  await page.goto('/ratings')
  await page.getByLabel('Email', { exact: true }).fill(player.email)
  await page.getByLabel('Password', { exact: true }).fill('IncorrectPassword!')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Incorrect email or password.', { exact: true })).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill(player.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/ratings$/)
  await expect(page.getByRole('heading', { name: 'Your Elo', exact: true })).toBeVisible()
})

test('sign-out protects history and a second account gets its own profile', async ({
  page,
  player,
  opponent,
}) => {
  await signIn(page, player)
  await signOut(page)
  await page.goto('/ratings')
  await expect(page).toHaveURL(/\/login$/)
  await signIn(page, opponent, '/ratings')
  await expect(page.getByRole('button', { name: 'Open User Profile Menu' })).not.toContainText(
    player.displayName,
  )
  await expect(page.getByText('No rated matches yet.', { exact: false })).toBeVisible()
})

test('home header fits a small phone and exposes keyboard navigation', async ({
  page,
  player,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await signIn(page, player)
  const link = page.getByRole('link', { name: 'View piano Elo and rating history' })
  await expect(link).toContainText('Piano-400')
  const menu = page.getByRole('button', { name: 'Open User Profile Menu' })
  const width = page.viewportSize()!.width
  for (const element of [link, menu]) {
    const box = await element.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
  }
  // macOS Safari's default full-link navigation uses Option+Tab.
  const key =
    process.platform === 'darwin' && testInfo.project.name === 'webkit-desktop' ? 'Alt+Tab' : 'Tab'
  await page.keyboard.press(key)
  await expect(link).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/ratings$/)
})

test('the real API rejects a request without a Firebase ID token', async ({ request }) => {
  const response = await request.get(TEST_ENV.apiURL + '/api/v1/skill-ratings/piano')
  expect(response.status()).toBe(401)
})
