import { newScenario, newScenarioVersion } from '../../../src/lib/schema/collections.js'
import { signIn } from '../support/auth.js'
import { TEST_ENV } from '../support/environment.js'
import { test, expect } from '../support/fixtures.js'

test('two authenticated players receive one shared lobby, refresh and leave safely', async ({
  page,
  browser,
  data,
  player,
  opponent,
}, testInfo) => {
  const scenarioId = data.id('scenario')
  const versionId = data.id('version')
  const title = 'Demo shared riff ' + data.namespace
  const difficulty =
    testInfo.project.name === 'webkit-desktop'
      ? 4
      : testInfo.project.name === 'chromium-mobile'
        ? 7
        : 1
  const elo = 400 + (difficulty - 1) * 200
  await data.seed([
    [
      'scenarios/' + scenarioId,
      {
        ...newScenario({
          id: scenarioId,
          authorUid: player.uid,
          title,
          instrument: 'guitar',
          visibility: 'public',
          authorDifficulty: difficulty,
        }),
        currentVersionId: versionId,
        currentVersionNumber: 1,
      },
    ],
    [
      'scenarios/' + scenarioId + '/versions/' + versionId,
      newScenarioVersion({
        id: versionId,
        scenarioId,
        versionNumber: 1,
        createdByUid: player.uid,
        durationMs: 60_000,
        chart: {
          tempoMap: [{ atBeat: 0, bpm: 100, timeSigNum: 4, timeSigDen: 4 }],
          keySignature: 0,
          parts: [
            {
              partId: 'lead',
              name: 'Guitar',
              instrument: 'guitar',
              notes: [{ index: 0, midiPitch: 60, startBeat: 0, durationBeats: 1, velocity: 90 }],
            },
          ],
        },
      }),
    ],
  ])
  for (const user of [player, opponent]) {
    await data.update('userSettings/' + user.uid, { preferredInstrument: 'guitar' })
    await data.update('users/' + user.uid + '/skillRatings/guitar', { elo })
    data.track(['matchmakingReservations/' + user.uid])
  }
  const otherContext = await browser.newContext({ baseURL: TEST_ENV.baseURL })
  try {
    const otherPage = await otherContext.newPage()
    await signIn(page, player)
    await signIn(otherPage, opponent)
    await page.getByRole('button', { name: 'Online Play', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('Finding a suitable opponent')
    await otherPage.getByRole('button', { name: 'Online Play', exact: true }).click()
    const panel = page.getByRole('region', { name: 'Matched opponent' })
    const otherPanel = otherPage.getByRole('region', { name: 'Matched opponent' })
    await expect(panel).toContainText(opponent.displayName)
    await expect(otherPanel).toContainText(player.displayName)
    const matchId = await panel.getAttribute('data-match-id')
    expect(matchId).toBeTruthy()
    data.track([
      'matches/' + matchId,
      ...[player, opponent].map(({ uid }) => 'matches/' + matchId + '/participants/' + uid),
    ])
    await expect(otherPanel).toHaveAttribute('data-match-id', matchId!)
    await expect(panel).toHaveAttribute('data-scenario-version', versionId)
    await expect(otherPanel).toHaveAttribute('data-scenario-version', versionId)
    expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(
      true,
    )
    expect((await data.read('matches/' + matchId))?.state).toBe('lobby')
    expect((await data.read('users/' + player.uid + '/skillRatings/guitar'))?.gamesPlayed).toBe(0)
    await testInfo.attach('matched-lobby', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
    await page.reload()
    await expect(panel).toHaveAttribute('data-match-id', matchId!)
    await page.goto('/home')
    await page.getByRole('button', { name: 'Rejoin Multiplayer', exact: true }).click()
    await expect(panel).toHaveAttribute('data-match-id', matchId!)
    await page.getByRole('button', { name: 'Leave lobby', exact: true }).click()
    await expect(page).toHaveURL(/\/home$/)
    await expect(otherPage.getByRole('status')).toContainText('Finding a suitable opponent')
    expect((await data.read('matches/' + matchId))?.state).toBe('abandoned')
    expect(await data.read('matchmakingReservations/' + player.uid)).toBeUndefined()
    expect(await data.read('matchmakingReservations/' + opponent.uid)).toBeUndefined()
    await otherPage.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(otherPage).toHaveURL(/\/home$/)
    await expect(page.getByRole('button', { name: 'Online Play', exact: true })).toBeVisible()
  } finally {
    await otherContext.close()
  }
})

test('an unmatched player can cancel without creating a lobby', async ({ page, player, data }) => {
  await data.update('userSettings/' + player.uid, { preferredInstrument: 'woodwind' })
  await signIn(page, player)
  await page.getByRole('button', { name: 'Online Play', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Finding a suitable opponent')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page).toHaveURL(/\/home$/)
  expect(await data.read('matchmakingReservations/' + player.uid)).toBeUndefined()
})
