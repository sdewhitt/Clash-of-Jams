/**
 * The play page around a run: loading the version, the gameplay controls, and what happens to
 * a finished run. The microphone loop itself is exercised in the Audio Lab and the audio tests;
 * here PlayStage is either left idle or replaced with a button that finishes a run.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiFetch } from '@/lib/api'
import { loadInputLatencyMs } from '@/lib/play/settings'
import { buildTimeline } from '@/lib/play/timeline'
import { submitRun } from '@/lib/runs/store'
import { loadScenario } from '@/lib/scenarios/store'
import { DEFAULT_SCORING_RULES } from '@/lib/schema/collections'
import type { ExpectedNote, Scenario, ScenarioVersion } from '@/lib/schema/types'
import { PlayScenario } from '@/pages/PlayScenario'
import type { PlayOutcome } from '@/pages/play/PlayStage'
import { renderAtRoute, signedIn } from '@/test/render'

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiFetch: vi.fn(),
}))
vi.mock('@/lib/scenarios/store', () => ({ loadScenario: vi.fn() }))
vi.mock('@/lib/runs/store', () => ({ submitRun: vi.fn() }))
vi.mock('@/lib/play/settings', () => ({
  loadInputLatencyMs: vi.fn(),
  saveInputLatencyMs: vi.fn(),
}))

const NOTES: ExpectedNote[] = [60, 62, 64].map((midiPitch, index) => ({
  index,
  midiPitch,
  startBeat: index,
  durationBeats: 1,
  velocity: 96,
}))
const TEMPO_MAP = [{ atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 }]

const scenario = { id: 's1', title: 'Chromatic warmup', currentVersionId: 'v1' } as Scenario
const version = {
  id: 'v1',
  scenarioId: 's1',
  scoringRules: DEFAULT_SCORING_RULES,
  chart: {
    keySignature: 0,
    tempoMap: TEMPO_MAP,
    parts: [{ partId: 'lead', name: 'Lead', instrument: 'guitar', notes: NOTES }],
  },
} as ScenarioVersion

const OUTCOME: PlayOutcome = {
  partId: 'lead',
  instrument: 'guitar',
  speedMultiplier: 1,
  scoringRules: DEFAULT_SCORING_RULES,
  timeline: buildTimeline({ notes: NOTES, tempoMap: TEMPO_MAP }),
  score: {
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
  },
}

const stage = vi.hoisted(() => ({ fake: false }))
vi.mock('@/pages/play/PlayStage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/pages/play/PlayStage')>()
  return {
    ...actual,
    PlayStage: (props: Parameters<typeof actual.PlayStage>[0]) =>
      stage.fake ? (
        <button onClick={() => props.onFinish(OUTCOME)}>Finish run</button>
      ) : (
        <actual.PlayStage {...props} />
      ),
  }
})

function renderPlay(route = '/play/s1?version=v1') {
  return renderAtRoute(<PlayScenario />, { path: '/play/:scenarioId', route, auth: signedIn() })
}

beforeEach(() => {
  stage.fake = false
  vi.mocked(loadScenario).mockReset().mockResolvedValue({ scenario, version })
  vi.mocked(submitRun).mockReset()
  vi.mocked(loadInputLatencyMs).mockReset().mockResolvedValue(0)
  // The rating pre-fill and the leaderboard; neither is under test here.
  vi.mocked(apiFetch).mockReset().mockResolvedValue(null)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('before a run', () => {
  it('loads the version named in the URL and shows its chart', async () => {
    renderPlay()

    expect(await screen.findByRole('heading', { name: 'Chromatic warmup' })).toBeInTheDocument()
    expect(loadScenario).toHaveBeenCalledWith('s1', 'v1')
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled()
    for (const name of ['C4', 'D4', 'E4']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
  })

  it('restores the saved input latency', async () => {
    vi.mocked(loadInputLatencyMs).mockResolvedValue(85)
    renderPlay()

    await waitFor(() => expect(screen.getByLabelText('Input latency (ms)')).toHaveValue(85))
    expect(loadInputLatencyMs).toHaveBeenCalledWith('user-1')
  })

  it('says so when the scenario has no version to play', async () => {
    vi.mocked(loadScenario).mockResolvedValue({ scenario, version: null })
    renderPlay('/play/s1')

    expect(await screen.findByText(/no playable version/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
  })

  it('will not start a part with no notes', async () => {
    const empty = {
      ...version,
      chart: { ...version.chart, parts: [{ ...version.chart.parts[0], notes: [] }] },
    }
    vi.mocked(loadScenario).mockResolvedValue({ scenario, version: empty })
    renderPlay()

    expect(await screen.findByText(/no notes to play/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
  })

  it('reports a scenario that fails to load', async () => {
    vi.mocked(loadScenario).mockRejectedValue(new Error('That scenario no longer exists.'))
    renderPlay()

    expect(await screen.findByRole('alert')).toHaveTextContent('That scenario no longer exists.')
  })
})

describe('after a run', () => {
  beforeEach(() => {
    stage.fake = true
  })

  it('saves the scored run and shows the result', async () => {
    vi.mocked(submitRun).mockResolvedValue({ runId: 'r1', validation: 'accepted', reason: null })
    renderPlay()

    await userEvent.click(await screen.findByRole('button', { name: 'Finish run' }))

    expect(screen.getByLabelText('Final score')).toHaveTextContent('73.33')
    expect(screen.getByText(/Hit 2 · Early 0 · Late 0 · Wrong pitch 1 · Missed 0/)).toBeVisible()
    expect(submitRun).toHaveBeenCalledWith({
      uid: 'user-1',
      scenarioId: 's1',
      scenarioVersionId: 'v1',
      instrument: 'guitar',
      partId: 'lead',
      speedMultiplier: 1,
      scoringRules: DEFAULT_SCORING_RULES,
      finalScore: 73.33,
      breakdown: OUTCOME.score.breakdown,
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
