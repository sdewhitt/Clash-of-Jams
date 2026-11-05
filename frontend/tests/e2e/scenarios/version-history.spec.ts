import { emptyChart, newScenario, newScenarioVersion } from '../../../src/lib/schema/collections.js'
import { signIn } from '../support/auth.js'
import type { TestData, TestPlayer } from '../support/data.js'
import { test, expect } from '../support/fixtures.js'

/** A scenario saved `count` times; version n holds n notes. */
async function seedVersions(data: TestData, player: TestPlayer, count: number) {
  const id = data.id('scenario')
  const title = 'History ' + data.namespace
  const blank = emptyChart('piano')
  const versions = Array.from({ length: count }, (_, at) => {
    const notes = Array.from({ length: at + 1 }, (_, index) => ({
      index,
      midiPitch: 60 + index,
      startBeat: index,
      durationBeats: 1,
      velocity: 80,
    }))
    const chart = { ...blank, parts: [{ ...blank.parts[0], notes }] }
    const versionId = id + '-v' + (at + 1)
    return [
      'scenarios/' + id + '/versions/' + versionId,
      newScenarioVersion({
        id: versionId,
        scenarioId: id,
        versionNumber: at + 1,
        createdByUid: player.uid,
        chart,
        durationMs: 1000 * (at + 1),
      }),
    ] as const
  })
  await data.seed([
    [
      'scenarios/' + id,
      {
        ...newScenario({ id, authorUid: player.uid, title, instrument: 'piano' }),
        currentVersionId: id + '-v' + count,
        currentVersionNumber: count,
      },
    ],
    ...versions,
  ])
  return { id, title }
}

async function openHistory(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('tab', { name: 'Your Library', exact: true }).click()
  await page.getByRole('button', { name: 'Version history of ' + title, exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
}

test('an author can browse, name and view versions from Your Library', async ({
  page,
  data,
  player,
}) => {
  const { title } = await seedVersions(data, player, 3)
  await signIn(page, player, '/scenario_editor')
  await openHistory(page, title)

  const headings = page.getByRole('tabpanel').getByRole('heading', { level: 3 })
  await expect(headings).toHaveText(['Version 3', 'Version 2', 'Version 1'])

  await page.getByRole('button', { name: 'Rename version 2', exact: true }).click()
  await page.getByLabel('Name for version 2', { exact: true }).fill('Bridge rewrite')
  await page.getByRole('button', { name: 'Save Name', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Version 2: Bridge rewrite' })).toBeVisible()

  // The name is stored, not just shown.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Version 2: Bridge rewrite' })).toBeVisible()

  await page.getByRole('button', { name: 'View version 2', exact: true }).click()
  await expect(page.getByText(/^Read only/)).toBeVisible()
  await expect(page.getByRole('application')).toHaveAccessibleName('Note grid, 2 notes placed')
})

test('reverting deletes later versions, updates the editor, and strands their links', async ({
  page,
  data,
  player,
}) => {
  const { id, title } = await seedVersions(data, player, 3)
  await signIn(page, player, '/scenario_editor')
  await openHistory(page, title)

  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Revert to version 1', exact: true }).click()

  await expect(page.getByRole('status')).toHaveText(
    'Reverted to version 1. Deleted 2 later versions.',
  )
  const headings = page.getByRole('tabpanel').getByRole('heading', { level: 3 })
  await expect(headings).toHaveText(['Version 1'])

  await page.getByRole('button', { name: 'Open Latest in Editor', exact: true }).click()
  await expect(page.getByRole('application')).toHaveAccessibleName('Note grid, 1 notes placed')
  await expect(page.getByRole('button', { name: 'Save Version', exact: true })).toBeDisabled()

  await page.goto('/play/' + id + '?version=' + id + '-v3')
  await expect(page.getByText('This version of the scenario is no longer available.')).toBeVisible()
})

test('unsaved edits survive a trip to the history and back', async ({ page, data, player }) => {
  const { title } = await seedVersions(data, player, 2)
  await signIn(page, player, '/scenario_editor')
  await page.getByRole('tab', { name: 'Your Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open in Editor', exact: true }).click()

  const titleField = page.getByLabel('Title', { exact: true })
  await expect(titleField).toHaveValue(title)
  await expect(page.getByRole('button', { name: 'Save Version', exact: true })).toBeDisabled()
  await titleField.fill(title + ' edited')
  await expect(page.getByRole('button', { name: 'Save Version', exact: true })).toBeEnabled()

  await page.getByRole('tab', { name: 'Version History', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Version 2', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Editing Scenario', exact: true }).click()

  await expect(titleField).toHaveValue(title + ' edited')
})

test('saving records settings, and an unchanged save adds no version', async ({
  page,
  data,
  player,
}) => {
  const { title } = await seedVersions(data, player, 1)
  await signIn(page, player, '/scenario_editor')
  await page.getByRole('tab', { name: 'Your Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open in Editor', exact: true }).click()

  const titleField = page.getByLabel('Title', { exact: true })
  await expect(titleField).toHaveValue(title)
  await titleField.fill(title + ' two')
  await page.getByRole('button', { name: 'Save Version', exact: true }).click()
  await expect(page.getByText('Saved as version 2.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save Version', exact: true })).toBeDisabled()

  await page.getByRole('tab', { name: 'Version History', exact: true }).click()
  const headings = page.getByRole('tabpanel').getByRole('heading', { level: 3 })
  await expect(headings).toHaveText(['Version 2', 'Version 1'])
  await expect(page.getByText(title + ' two · Piano · difficulty 1/10')).toBeVisible()
  await expect(page.getByText('Settings not recorded')).toBeVisible()
})

test('a reload offers unsaved work back', async ({ page, data, player }) => {
  const { title } = await seedVersions(data, player, 1)
  await signIn(page, player, '/scenario_editor')
  await page.getByRole('tab', { name: 'Your Library', exact: true }).click()
  await page.getByRole('button', { name: 'Open in Editor', exact: true }).click()

  const titleField = page.getByLabel('Title', { exact: true })
  await expect(titleField).toHaveValue(title)
  await titleField.fill(title + ' unsaved')
  await expect
    .poll(() => page.evaluate(() => localStorage.length > 0 && JSON.stringify({ ...localStorage })))
    .toContain('unsaved')

  await page.reload()
  await page.getByRole('button', { name: 'Restore Draft', exact: true }).click()
  await expect(titleField).toHaveValue(title + ' unsaved')
})

test('a revert across 35 versions deletes all the later ones in one go', async ({
  page,
  data,
  player,
}) => {
  const { title } = await seedVersions(data, player, 35)
  await signIn(page, player, '/scenario_editor')
  await openHistory(page, title)

  await page.getByRole('button', { name: /older versions/i }).click()
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: 'Revert to version 1', exact: true }).click()

  await expect(page.getByRole('status')).toHaveText(
    'Reverted to version 1. Deleted 34 later versions.',
  )
  await expect(page.getByRole('tabpanel').getByRole('heading', { level: 3 })).toHaveText([
    'Version 1',
  ])
})

test.describe('two tabs editing one scenario', () => {
  async function openBoth(
    page: import('@playwright/test').Page,
    data: TestData,
    player: TestPlayer,
  ) {
    const { id, title } = await seedVersions(data, player, 1)
    await signIn(page, player, '/scenario_editor')
    const url = '/scenario_editor?tab=new&scenario=' + id
    await page.goto(url)
    const other = await page.context().newPage()
    await other.goto(url)
    for (const tab of [page, other]) {
      await expect(tab.getByLabel('Title', { exact: true })).toHaveValue(title)
    }

    await other.getByLabel('Title', { exact: true }).fill(title + ' from other tab')
    await other.getByRole('button', { name: 'Save Version', exact: true }).click()
    await expect(other.getByText('Saved as version 2.')).toBeVisible()

    await page.getByLabel('Title', { exact: true }).fill(title + ' from this tab')
    await page.getByRole('button', { name: 'Save Version', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('saved somewhere else')
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(title + ' from this tab')
    return { title, other }
  }

  test('the second save is warned, and can reload the latest', async ({ page, data, player }) => {
    const { title } = await openBoth(page, data, player)

    await page.getByRole('button', { name: 'Reload Latest', exact: true }).click()

    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(title + ' from other tab')
    await page.getByRole('tab', { name: 'Version History', exact: true }).click()
    await expect(page.getByRole('tabpanel').getByRole('heading', { level: 3 })).toHaveText([
      'Version 2',
      'Version 1',
    ])
  })

  test('the second save can become a private copy', async ({ page, data, player }) => {
    const { title } = await openBoth(page, data, player)

    await page.getByRole('button', { name: 'Save as Copy', exact: true }).click()

    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(
      title + ' from this tab (copy)',
    )
    await expect(page.getByLabel('Visibility', { exact: true })).toHaveValue('private')
    await page.getByRole('tab', { name: 'Your Library', exact: true }).click()
    await expect(page.getByRole('heading', { name: title + ' from other tab' })).toBeVisible()
    await expect(page.getByRole('heading', { name: title + ' from this tab (copy)' })).toBeVisible()
  })
})
