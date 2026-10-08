import { expect, type Page } from '@playwright/test'

import type { TestPlayer } from './data.js'

/** Use the real login form; browser authentication is never bypassed. */
export async function signIn(page: Page, player: TestPlayer, destination = '/home') {
  await page.goto(destination)
  await expect(page).toHaveURL(/\/login$/)
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(player.email)
  await page.getByLabel('Password', { exact: true }).fill(player.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(destination + '$'))
  await expect(page.getByRole('button', { name: 'Open User Profile Menu' })).toContainText(
    player.displayName,
  )
}

export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Open User Profile Menu' }).click()
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
}
