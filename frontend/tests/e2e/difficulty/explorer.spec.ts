import {
  emptyChart,
  newRun,
  newScenario,
  newScenarioVersion,
} from '../../../src/lib/schema/collections.js'
import { signIn, signOut } from '../support/auth.js'
import { test, expect } from '../support/fixtures.js'

test('scenario tabs explain easy, hard and provisional synthetic evidence', async ({
  page,
  player,
}, testInfo) => {
  await signIn(page, player)
  await page.getByRole('button', { name: 'Scenario Difficulty', exact: true }).click()
  const first = page.getByRole('tab', { name: 'Gentle warm-up' })
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('Easy', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('img', { name: 'Average normalized score by player Elo band' }),
  ).toBeVisible()
  await first.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('heading', { name: 'Fast passage', level: 2 })).toBeVisible()
  await expect(page.getByText('Hard', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Fast passage' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const slider = page.getByRole('slider', { name: /Player Elo/ })
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect(slider).toHaveValue('1125')
  await page.getByRole('button', { name: /1400\+ Elo/ }).click()
  await expect(page.getByText(/1400\+ Elo contributes 36 independent players/)).toBeVisible()
  const screenshot = testInfo.outputPath('difficulty-explorer.png')
  await page.screenshot({ fullPage: true, path: screenshot })
  await testInfo.attach('difficulty-explorer', { path: screenshot, contentType: 'image/png' })
  await page.getByRole('tab', { name: 'New composition' }).click()
  await expect(page.getByText('Provisional', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Repeated attempts' }).click()
  await expect(page.getByText('97 repeat attempts excluded by the per-player cap.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recompute and save estimate' })).toHaveCount(0)
  expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(
    true,
  )
})

test('the author computes and publishes difficulty from accepted musical runs through the real API', async ({
  page,
  data,
  player,
  opponent,
}) => {
  const id = data.id('difficulty')
  const versionId = data.id('version')
  const title = 'Evidence ' + data.namespace
  const chart = emptyChart('piano')
  chart.parts[0].notes = [{ index: 0, midiPitch: 60, startBeat: 0, durationBeats: 1, velocity: 80 }]
  const version = newScenarioVersion({
    id: versionId,
    scenarioId: id,
    versionNumber: 1,
    createdByUid: player.uid,
    chart,
  })
  await data.seed([
    [
      'scenarios/' + id,
      {
        ...newScenario({
          id,
          title,
          authorUid: player.uid,
          instrument: 'piano',
          visibility: 'public',
          authorDifficulty: 2,
        }),
        currentVersionId: versionId,
        currentVersionNumber: 1,
      },
    ],
    ['scenarios/' + id + '/versions/' + versionId, version],
    ...Array.from({ length: 12 }, (_, index) => {
      const runId = data.id('run')
      return [
        'runs/' + runId,
        {
          ...newRun({
            id: runId,
            userUid: data.id('musician'),
            scenarioId: id,
            scenarioVersionId: versionId,
            instrument: 'piano',
            partId: chart.parts[0].partId,
            finalScore: 65,
            validation: 'accepted',
            breakdown: {
              pitchAccuracy: 0.65,
              rhythmAccuracy: 0.65,
              completeness: 0.65,
              notesHit: 1,
              notesMissed: 0,
              extraNotes: 0,
              noteResults: [],
            },
          }),
          inputSource: 'midi',
          completionReason: 'completed',
          normalizedScore: 0.65,
          ratingAtPlay: index < 6 ? 550 : 1100,
        },
      ] as const
    }),
  ])
  const aggregatePath = 'scenarios/' + id + '/difficultyEstimates/' + versionId
  data.track([aggregatePath])
  await signIn(page, player, '/scenario_difficulty')
  await page.getByRole('button', { name: 'Scenario library' }).click()
  await page.getByRole('tab', { name: title, exact: true }).click()
  await expect(page.getByText('Performance evidence')).toBeVisible()
  await expect(page.getByText('medium confidence', { exact: true })).toBeVisible()
  expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(
    true,
  )
  await page.getByRole('button', { name: 'Recompute and save estimate' }).click()
  await expect(page.getByText(/Estimate saved. Matchmaking can use/)).toBeVisible()
  const saved = await data.read('scenarios/' + id)
  expect(saved?.crowdDifficulty).toBeGreaterThan(1)
  expect(saved?.crowdDifficultyVersionId).toBe(versionId)
  expect((await data.read(aggregatePath))?.distinctPlayers).toBe(12)
  await signOut(page)
  await signIn(page, opponent, '/scenario_difficulty')
  await page.goto('/scenario_difficulty?source=library&scenario=' + id)
  await expect(page.getByRole('heading', { name: title, level: 2 })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recompute and save estimate' })).toHaveCount(0)
})
