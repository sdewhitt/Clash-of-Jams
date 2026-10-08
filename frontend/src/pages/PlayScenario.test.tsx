/**
 * The play page around a run: loading the version to play, and what happens to a finished run.
 * The player itself is covered beside ScenarioPlayer; here it is either left idle or replaced
 * with a button that finishes a run.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FinishedRun } from '@/components/ScenarioPlayer'
import { apiFetch } from '@/lib/api'
import { getUserSettings } from '@/lib/profile/UserSettings'
import { submitRun } from '@/lib/runs/store'
import { loadScenario } from '@/lib/scenarios/store'
import { DEFAULT_SCORING_RULES } from '@/lib/schema/collections'
import type { ExpectedNote, Scenario, ScenarioVersion, UserSettings } from '@/lib/schema/types'
import { PlayScenario } from '@/pages/PlayScenario'
import { explainScore } from '@/scoring/explain'
import type { ScoreResult } from '@/scoring/score'
import { renderAtRoute, signedIn } from '@/test/render'

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiFetch: vi.fn(),
}))
vi.mock('@/lib/scenarios/store', () => ({ loadScenario: vi.fn() }))
vi.mock('@/lib/runs/store', () => ({ submitRun: vi.fn() }))
vi.mock('@/lib/profile/UserSettings', () => ({ getUserSettings: vi.fn() }))

const NOTES: ExpectedNote[] = [60, 62, 64].map((midiPitch, index) => ({
  index,
  midiPitch,
  startBeat: index,
  durationBeats: 1,
  velocity: 96,
}))

const scenario = {
  id: 's1',
  title: 'Chromatic warmup',
  instrument: 'guitar',
  currentVersionId: 'v1',
} as Scenario
const version = {
  id: 'v1',
  scenarioId: 's1',
  scoringRules: DEFAULT_SCORING_RULES,
  chart: {
    keySignature: 0,
    tempoMap: [{ atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 }],
    parts: [{ partId: 'lead', name: 'Lead', instrument: 'guitar', notes: NOTES }],
  },
} as ScenarioVersion

const RESULT: ScoreResult = {
  finalScore: 73.33,
  breakdown: {
    pitchAccuracy: 66.67,
    rhythmAccuracy: 66.67,
    completeness: 100,
    notesHit: 2,
    notesMissed: 0,
    extraNotes: 1,
    noteResults: [
      { expectedNoteIndex: 0, verdict: 'hit', timingDeltaMs: 4, centsDeviation: 3 },
      { expectedNoteIndex: 1, verdict: 'hit', timingDeltaMs: -8, centsDeviation: -5 },
      { expectedNoteIndex: 2, verdict: 'wrong_pitch', timingDeltaMs: 2, centsDeviation: 100 },
    ],
  },
}
const FINISHED: FinishedRun = {
  instrument: 'piano',
  performed: [],
  result: RESULT,
  explanation: explainScore({ result: RESULT, expected: NOTES }),
}

const player = vi.hoisted(() => ({ fake: false }))
vi.mock('@/components/ScenarioPlayer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ScenarioPlayer')>()
  return {
    ...actual,
    ScenarioPlayer: (props: Parameters<typeof actual.ScenarioPlayer>[0]) =>
      player.fake ? (
        <button onClick={() => props.onFinish(FINISHED)}>Finish run</button>
      ) : (
        <actual.ScenarioPlayer {...props} />
      ),
  }
})

function renderPlay(route = '/play/s1?version=v1') {
  return renderAtRoute(<PlayScenario />, { path: '/play/:scenarioId', route, auth: signedIn() })
}

beforeEach(() => {
  player.fake = false
  vi.mocked(loadScenario).mockReset().mockResolvedValue({ scenario, version })
  vi.mocked(submitRun).mockReset()
  vi.mocked(getUserSettings)
    .mockReset()
    .mockResolvedValue({ inputLatencyOffsetMs: 40 } as UserSettings)
  // The rating pre-fill and the leaderboard; neither is under test here.
  vi.mocked(apiFetch).mockReset().mockResolvedValue(null)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('before a run', () => {
  it('loads the version named in the URL', async () => {
    renderPlay()

    expect(await screen.findByText('Chromatic warmup')).toBeInTheDocument()
    expect(loadScenario).toHaveBeenCalledWith('s1', 'v1')
    expect(screen.getByText(/3 notes at 120 bpm/)).toBeInTheDocument()
    expect(screen.getByLabelText('Instrument')).toHaveValue('guitar')
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled()
  })

  it('falls back to the current version when the URL names none', async () => {
    renderPlay('/play/s1')

    expect(await screen.findByText('Chromatic warmup')).toBeInTheDocument()
    expect(loadScenario).toHaveBeenCalledWith('s1', null)
  })

  it("plays in the scenario theme from the player's settings", async () => {
    vi.mocked(getUserSettings).mockResolvedValue({
      inputLatencyOffsetMs: 40,
      scenarioTheme: 'neon',
    } as UserSettings)
    renderPlay()

    await screen.findByText('Chromatic warmup')
    await vi.waitFor(() => expect(screen.getByRole('main')).toHaveAttribute('data-theme', 'neon'))
  })

  it('says so when the scenario has nothing to play', async () => {
    vi.mocked(loadScenario).mockResolvedValue({ scenario, version: null })
    renderPlay()

    expect(await screen.findByText(/no notes to play/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
  })
})

describe('after a run', () => {
  beforeEach(() => {
    player.fake = true
  })

  it('saves the scored run against the version and part that were played', async () => {
    vi.mocked(submitRun).mockResolvedValue({ runId: 'r1', validation: 'accepted', reason: null })
    renderPlay()

    await userEvent.click(await screen.findByRole('button', { name: 'Finish run' }))

    expect(screen.getByRole('region', { name: 'Your score' })).toHaveTextContent('73.33')
    expect(screen.getByTestId('note-highway')).toBeInTheDocument()
    expect(submitRun).toHaveBeenCalledWith({
      uid: 'user-1',
      scenarioId: 's1',
      scenarioVersionId: 'v1',
      instrument: 'piano',
      partId: 'lead',
      speedMultiplier: 1,
      scoringRules: DEFAULT_SCORING_RULES,
      finalScore: 73.33,
      breakdown: RESULT.breakdown,
    })
    expect(await screen.findByText('Run saved to the leaderboard.')).toBeInTheDocument()
  })

  it('explains a rejected run', async () => {
    vi.mocked(submitRun).mockResolvedValue({
      runId: 'r1',
      validation: 'rejected',
      reason: 'Final score does not match the breakdown',
    })
    renderPlay()

    await userEvent.click(await screen.findByRole('button', { name: 'Finish run' }))

    expect(
      await screen.findByText(
        'This run was not accepted: Final score does not match the breakdown.',
      ),
    ).toBeInTheDocument()
  })

  it('says when the run could not be saved at all', async () => {
    vi.mocked(submitRun).mockRejectedValue(new Error('permission-denied'))
    renderPlay()

    await userEvent.click(await screen.findByRole('button', { name: 'Finish run' }))

    expect(await screen.findByText('Your run could not be saved.')).toBeInTheDocument()
  })
})
