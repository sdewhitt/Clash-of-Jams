import { newScenario } from '../../../src/lib/schema/collections.js'
import { signIn } from '../support/auth.js'
import { test, expect } from '../support/fixtures.js'

test('an owned scenario is browsable through the real authenticated API', async ({
  page,
  data,
  player,
}) => {
  const id = data.id('scenario')
  const title = 'UI practice ' + data.namespace
  await data.seed([
    ['scenarios/' + id, newScenario({ id, authorUid: player.uid, title, instrument: 'piano' })],
  ])
  await signIn(page, player, '/scenario_search')
  const item = page.getByRole('listitem').filter({ hasText: title })
  await expect(item).toBeVisible()
  await item.getByRole('button', { name: 'Select', exact: true }).click()
  await expect(item.getByRole('button', { name: 'Selected', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play!', exact: true })).toBeEnabled()
})
