/**
 * Play test in the scenario editor: previewing the draft in hand with the real player, without
 * saving the scenario or a run.
 */
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FinishedRun } from '@/components/ScenarioPlayer'
import { getUserSettings } from '@/lib/profile/UserSettings'
import { submitRun } from '@/lib/runs/store'
import { listMyScenarios, loadScenario, saveScenarioDraft } from '@/lib/scenarios/store'
import type { UserSettings } from '@/lib/schema/types'
import { ScenarioEditor } from '@/pages/ScenarioEditor'
import { explainScore } from '@/scoring/explain'
import type { ScoreResult } from '@/scoring/score'
import { renderAtRoute, signedIn } from '@/test/render'

vi.mock('@/lib/scenarios/store', () => ({
  listMyScenarios: vi.fn(),
  loadScenario: vi.fn(),
  saveScenarioDraft: vi.fn(),
}))
vi.mock('@/lib/runs/store', () => ({ submitRun: vi.fn() }))
vi.mock('@/lib/profile/UserSettings', () => ({ getUserSettings: vi.fn() }))

const RESULT: ScoreResult = {
  finalScore: 80,
  breakdown: {
    pitchAccuracy: 50,
    rhythmAccuracy: 100,
    completeness: 100,
    notesHit: 1,
    notesMissed: 0,
    extraNotes: 0,
    noteResults: [
      { expectedNoteIndex: 0, verdict: 'hit', timingDeltaMs: 5, centsDeviation: 2 },
      { expectedNoteIndex: 1, verdict: 'wrong_pitch', timingDeltaMs: 3, centsDeviation: 100 },
    ],
  },
}

const player = vi.hoisted(() => ({ fake: false, latencyMs: null as number | null }))
vi.mock('@/components/ScenarioPlayer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ScenarioPlayer')>()
  return {
    ...actual,
    ScenarioPlayer: (props: Parameters<typeof actual.ScenarioPlayer>[0]) => {
      player.latencyMs = props.latencyMs
      if (!player.fake) return <actual.ScenarioPlayer {...props} />
      const finished: FinishedRun = {
        instrument: props.defaultInstrument,
        performed: [],
        result: RESULT,
        explanation: explainScore({ result: RESULT, expected: props.expected }),
      }
      return <button onClick={() => props.onFinish(finished)}>Finish run</button>
    },
  }
})

const scoreFile = () =>
  new File(
    [
      '<score-partwise><work><work-title>Ode to Joy</work-title></work>' +
        '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>' +
        '<part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>' +
        '<direction><sound tempo="90"/></direction>' +
        '<note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration></note>' +
        '<note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration></note>' +
        '</measure></part></score-partwise>',
    ],
    'ode.musicxml',
  )

/** Opens the editor and gives the draft two notes, without saving it. */
async function renderEditorWithNotes() {
  renderAtRoute(<ScenarioEditor />, { path: '/scenario_editor', auth: signedIn() })
  await userEvent.upload(screen.getByLabelText('MusicXML file'), scoreFile())
  await screen.findByText('Imported 2 notes from ode.musicxml.')
}

beforeEach(() => {
  player.fake = false
  player.latencyMs = null
  vi.mocked(listMyScenarios).mockReset().mockResolvedValue([])
  vi.mocked(loadScenario).mockReset()
  vi.mocked(saveScenarioDraft).mockReset()
  vi.mocked(submitRun).mockReset()
  vi.mocked(getUserSettings)
    .mockReset()
    .mockResolvedValue({ inputLatencyOffsetMs: 60 } as UserSettings)
})

describe('play test', () => {
  it('is unavailable until the chart has notes', () => {
    renderAtRoute(<ScenarioEditor />, { path: '/scenario_editor', auth: signedIn() })

    expect(screen.getByRole('button', { name: 'Play Test' })).toBeDisabled()
  })

  it('opens the player on the unsaved draft', async () => {
    await renderEditorWithNotes()

    await userEvent.click(screen.getByRole('button', { name: 'Play Test' }))

    const dialog = screen.getByRole('dialog', { name: 'Play test: Ode to Joy' })
    expect(within(dialog).getByText(/2 notes at 90 bpm/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Instrument')).toHaveValue('piano')
    expect(within(dialog).getByRole('button', { name: 'Start' })).toBeEnabled()
    expect(saveScenarioDraft).not.toHaveBeenCalled()
  })

  it("plays with the author's saved input latency", async () => {
    await renderEditorWithNotes()

    await userEvent.click(screen.getByRole('button', { name: 'Play Test' }))

    await vi.waitFor(() => expect(player.latencyMs).toBe(60))
    expect(getUserSettings).toHaveBeenCalledWith('user-1')
  })

  it('shows the score for a finished take without saving a run', async () => {
    player.fake = true
    await renderEditorWithNotes()
    await userEvent.click(screen.getByRole('button', { name: 'Play Test' }))

    await userEvent.click(screen.getByRole('button', { name: 'Finish run' }))

    expect(screen.getByRole('region', { name: 'Your score' })).toHaveTextContent('80')
    expect(screen.getByTestId('note-highway')).toBeInTheDocument()
    expect(submitRun).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Play again' }))
    expect(screen.getByRole('button', { name: 'Finish run' })).toBeInTheDocument()
  })

  it('returns to the editor with the draft intact', async () => {
    await renderEditorWithNotes()
    await userEvent.click(screen.getByRole('button', { name: 'Play Test' }))

    await userEvent.click(screen.getByRole('button', { name: 'Back to editor' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Ode to Joy')
    expect(screen.getByText(/^2 notes · 90 BPM/)).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    await renderEditorWithNotes()
    await userEvent.click(screen.getByRole('button', { name: 'Play Test' }))

    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
