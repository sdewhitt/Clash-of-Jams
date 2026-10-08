import type { Browser, Page, TestInfo } from '@playwright/test'

import { newScenario, newScenarioVersion } from '../../../src/lib/schema/collections.js'
import type { Instrument } from '../../../src/lib/schema/types.js'
import { signIn } from '../support/auth.js'
import type { TestData, TestPlayer } from '../support/data.js'
import { TEST_ENV } from '../support/environment.js'
import { test, expect } from '../support/fixtures.js'

async function paired(
  page: Page,
  browser: Browser,
  data: TestData,
  player: TestPlayer,
  opponent: TestPlayer,
  info: TestInfo,
  instrument: Instrument,
) {
  const difficulty =
    info.project.name === 'webkit-desktop' ? 5 : info.project.name === 'chromium-mobile' ? 8 : 2
  const scenarioId = data.id('scenario'),
    versionId = data.id('version')
  await data.seed([
    [
      'scenarios/' + scenarioId,
      {
        ...newScenario({
          id: scenarioId,
          authorUid: player.uid,
          title: 'Multiplayer demo riff',
          instrument,
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
              name: 'Lead',
              instrument,
              notes: [{ index: 0, midiPitch: 60, startBeat: 0, durationBeats: 1, velocity: 90 }],
            },
          ],
        },
      }),
    ],
  ])
  for (const user of [player, opponent]) {
    await data.update('userSettings/' + user.uid, { preferredInstrument: instrument })
    await data.update('users/' + user.uid + '/skillRatings/' + instrument, {
      elo: 400 + (difficulty - 1) * 200,
    })
    data.track(['matchmakingReservations/' + user.uid])
  }
  const otherContext = await browser.newContext({ baseURL: TEST_ENV.baseURL })
  const otherPage = await otherContext.newPage()
  try {
    await signIn(page, player)
    await signIn(otherPage, opponent)
    await page.getByRole('button', { name: 'Online Play', exact: true }).click()
    await otherPage.getByRole('button', { name: 'Online Play', exact: true }).click()
    // Matchmaking refreshes the scenario catalog every ten seconds.
    await expect(page.getByRole('button', { name: 'Ready to play' })).toBeEnabled({
      timeout: 15_000,
    })
    await expect(otherPage.getByRole('button', { name: 'Ready to play' })).toBeEnabled({
      timeout: 15_000,
    })
    const matchId = (await page
      .getByRole('region', { name: 'Matched opponent' })
      .getAttribute('data-match-id'))!
    data.track([
      'matches/' + matchId,
      ...[player, opponent].flatMap(({ uid }) => [
        'matches/' + matchId + '/participants/' + uid,
        'users/' + uid + '/skillRatings/' + instrument + '/history/' + matchId,
      ]),
    ])
    await expect(otherPage.getByRole('region', { name: 'Matched opponent' })).toHaveAttribute(
      'data-match-id',
      matchId,
    )
    await expect(page.getByRole('region', { name: 'Matched opponent' })).toHaveAttribute(
      'data-scenario-version',
      versionId,
    )
    await page.getByRole('button', { name: 'Ready to play' }).click()
    await otherPage.getByRole('button', { name: 'Ready to play' }).click()
    await expect(page.getByRole('button', { name: /Tap beat/ })).toBeEnabled()
    await expect(otherPage.getByRole('button', { name: /Tap beat/ })).toBeEnabled()
    return { otherPage, otherContext, matchId }
  } catch (error) {
    await otherContext.close()
    throw error
  }
}

test('shared play, presets, both players rejoin with progress, and resignation updates Elo', async ({
  page,
  browser,
  data,
  player,
  opponent,
}, info) => {
  test.setTimeout(70_000)
  const pair = await paired(page, browser, data, player, opponent, info, 'piano')
  let otherPage = pair.otherPage
  try {
    await page.getByRole('button', { name: /Tap beat/ }).click()
    await expect(otherPage.getByRole('article', { name: 'Opponent performance' })).toContainText(
      '1/60 demo beats',
    )
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('log')).toContainText('You: Well done!')
    await expect(otherPage.getByRole('log')).toContainText('Opponent: Well done!')
    await otherPage.getByRole('button', { name: /Thanks!/ }).click()
    await expect(page.getByRole('log')).toContainText('Opponent: Thanks!')
    // Force a transport failure after a fresh page load. Details must come from
    // the real authenticated HTTP endpoint, rather than a retained hook snapshot.
    let interrupted = true
    await page.routeWebSocket(/\/api\/v1\/multiplayer\/[^/]+\/socket$/, (socket) => {
      if (interrupted) {
        socket.onMessage(() => socket.close({ code: 1013, reason: 'Test transport interruption' }))
      } else socket.connectToServer()
    })
    await page.reload()
    await expect(page.getByRole('region', { name: 'Reconnecting to match' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('Connection lost. Reconnecting…')
    await expect(page.getByRole('region', { name: 'Multiplayer match' })).toContainText(
      'Multiplayer demo riff',
    )
    await expect(page.getByRole('article', { name: 'Opponent performance' })).toContainText(
      opponent.displayName,
    )
    await expect(page.getByRole('article', { name: 'Your performance' })).toContainText(
      '1/60 demo beats',
    )
    await expect(page.getByRole('button', { name: /Tap beat/ })).toBeDisabled()
    await expect(page.getByRole('progressbar', { name: 'Match progress' })).toBeVisible()
    await info.attach('multiplayer-reconnect-details', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
    interrupted = false
    await page.getByRole('button', { name: 'Reconnect' }).click()
    await expect(page.getByRole('button', { name: /Tap beat/ })).toBeEnabled()
    await expect(page.getByRole('region', { name: 'Reconnecting to match' })).not.toBeVisible()
    await page.goto('/home')
    await expect(otherPage.getByText(/Opponent disconnected/)).toBeVisible()
    await otherPage.getByRole('button', { name: /Tap beat/ }).click()
    await page.getByRole('button', { name: 'Rejoin Multiplayer', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Multiplayer match' })).toHaveAttribute(
      'data-match-id',
      pair.matchId,
    )
    await expect(page.getByRole('article', { name: 'Opponent performance' })).toContainText(
      '1/60 demo beats',
    )
    await otherPage.close()
    await expect(page.getByText(/Opponent disconnected/)).toBeVisible()
    otherPage = await pair.otherContext.newPage()
    await otherPage.goto('/home')
    await otherPage.getByRole('button', { name: 'Rejoin Multiplayer', exact: true }).click()
    await expect(otherPage.getByRole('article', { name: 'Your performance' })).toContainText(
      '1/60 demo beats',
    )
    await expect(page.getByText(/Opponent disconnected/)).not.toBeVisible()
    expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(
      true,
    )
    await info.attach('multiplayer-gameplay', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
    await otherPage.getByRole('button', { name: 'Resign', exact: true }).click()
    await otherPage.getByRole('button', { name: 'Keep playing' }).click()
    expect((await data.read('matches/' + pair.matchId))?.state).toBe('in_progress')
    await otherPage.getByRole('button', { name: 'Resign', exact: true }).click()
    await otherPage.getByRole('button', { name: 'Confirm resign' }).click()
    await expect(page.getByRole('region', { name: 'Match results' })).toContainText('Win')
    await expect(otherPage.getByRole('region', { name: 'Match results' })).toContainText('Forfeit')
    const before =
      400 +
      ((info.project.name === 'webkit-desktop'
        ? 5
        : info.project.name === 'chromium-mobile'
          ? 8
          : 2) -
        1) *
        200
    await expect(page.getByRole('button', { name: 'View piano Elo details' })).toContainText(
      new Intl.NumberFormat('en-US').format(before + 16),
    )
    await info.attach('multiplayer-results', {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })
    await page.reload()
    await expect(page.getByRole('region', { name: 'Match results' })).toContainText('Win')
    for (const user of [player, opponent]) {
      expect((await data.read('users/' + user.uid + '/skillRatings/piano'))?.gamesPlayed).toBe(1)
      expect(
        await data.read('users/' + user.uid + '/skillRatings/piano/history/' + pair.matchId),
      ).toBeDefined()
    }
    await page.getByRole('button', { name: 'Return Home' }).click()
    await expect(page.getByRole('button', { name: 'Online Play', exact: true })).toBeVisible()
  } finally {
    await pair.otherContext.close()
  }
})

test('one full minute ends automatically using normalized demo scores', async ({
  page,
  browser,
  data,
  player,
  opponent,
}, info) => {
  test.skip(
    info.project.name !== 'chromium-desktop',
    'The full-duration clock is shared by all browsers.',
  )
  test.setTimeout(95_000)
  const pair = await paired(page, browser, data, player, opponent, info, 'vocals')
  try {
    await page.getByRole('button', { name: /Tap beat/ }).click()
    await expect(
      pair.otherPage.getByRole('article', { name: 'Opponent performance' }),
    ).toContainText('1/60 demo beats')
    await expect(page.getByRole('region', { name: 'Match results' })).toContainText('Win', {
      timeout: 65_000,
    })
    await expect(pair.otherPage.getByRole('region', { name: 'Match results' })).toContainText(
      'Loss',
    )
    const match = await data.read('matches/' + pair.matchId)
    expect(match?.completionReason).toBe('completed')
    expect(
      (await data.read('matches/' + pair.matchId + '/participants/' + player.uid))?.finalScore,
    ).toBeCloseTo(1 / 60)
  } finally {
    await pair.otherContext.close()
  }
})

test('20 seconds disconnected produces one forfeit and rejoin shows committed results', async ({
  page,
  browser,
  data,
  player,
  opponent,
}, info) => {
  test.setTimeout(70_000)
  const pair = await paired(page, browser, data, player, opponent, info, 'midi')
  try {
    await pair.otherPage.close()
    await expect(page.getByText(/Opponent disconnected/)).toBeVisible()
    await page.getByRole('button', { name: /Tap beat/ }).click()
    await expect(page.getByRole('article', { name: 'Your performance' })).toContainText(
      '1/60 demo beats',
    )
    await expect(page.getByRole('region', { name: 'Match results' })).toContainText(
      'disconnect forfeit',
      { timeout: 25_000 },
    )
    const reopened = await pair.otherContext.newPage()
    await reopened.goto('/multiplayer/' + pair.matchId)
    await expect(reopened.getByRole('region', { name: 'Match results' })).toContainText('Forfeit')
    for (const user of [player, opponent])
      expect((await data.read('users/' + user.uid + '/skillRatings/midi'))?.gamesPlayed).toBe(1)
    expect((await data.read('matches/' + pair.matchId))?.completionReason).toBe('disconnected')
  } finally {
    await pair.otherContext.close()
  }
})
