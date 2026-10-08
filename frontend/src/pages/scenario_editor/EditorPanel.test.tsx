/**
 * User story #25: creating, saving and reopening a scenario through the editor.
 *
 * The chart edits, the draft defaults and the Firestore writes are tested
 * beside their own modules. These drive the page the way an author does, with
 * the store mocked, to check the pieces are wired together.
 */
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { EDITOR_LIMITS, addNote } from '@/lib/chart/edits'
import {
  deleteScenario,
  listMyScenarios,
  loadScenario,
  saveScenarioDraft,
} from '@/lib/scenarios/store'
import { emptyChart } from '@/lib/schema/collections'
import type { Scenario, ScenarioVersion } from '@/lib/schema/types'
import { ScenarioEditor } from '@/pages/ScenarioEditor'
import { EditorPanel } from '@/pages/scenario_editor/EditorPanel'
import { withOpeningTempo } from '@/pages/scenario_editor/draft'
import { LocationProbe, renderAtRoute, SIGNED_OUT, signedIn } from '@/test/render'

vi.mock('@/lib/scenarios/store', () => ({
  deleteScenario: vi.fn(),
  listMyScenarios: vi.fn(),
  loadScenario: vi.fn(),
  saveScenarioDraft: vi.fn(),
}))

const BEAT_WIDTH = 64
const ROW_HEIGHT = 18

/** Client coordinates for a beat and pitch on the piano roll (see PianoRoll.test). */
function at(beat: number, pitch: number) {
  return { clientX: beat * BEAT_WIDTH, clientY: (EDITOR_LIMITS.maxPitch - pitch) * ROW_HEIGHT }
}

function savedDocuments() {
  const chart = withOpeningTempo(
    addNote(
      addNote(emptyChart('guitar'), 'lead', { midiPitch: 60, startBeat: 0, durationBeats: 1 }),
      'lead',
      { midiPitch: 64, startBeat: 2, durationBeats: 0.5 },
    ),
    { bpm: 90 },
  )
  const scenario = {
    id: 'abc',
    authorUid: 'user-1',
    title: 'Chromatic Warmup',
    description: 'Four bars, slowly.',
    instrument: 'guitar',
    visibility: 'public',
    authorDifficulty: 6,
    currentVersionId: 'abc-v2',
    currentVersionNumber: 2,
  } as Scenario
  const version = { id: 'abc-v2', scenarioId: 'abc', versionNumber: 2, chart } as ScenarioVersion
  return { scenario, version }
}

function renderEditor(route = '/scenario_editor') {
  return renderAtRoute(
    <>
      <ScenarioEditor />
      <LocationProbe />
    </>,
    { path: '/scenario_editor', route, auth: signedIn() },
  )
}

beforeEach(() => {
  vi.mocked(listMyScenarios).mockReset().mockResolvedValue([])
  vi.mocked(loadScenario).mockReset()
  vi.mocked(saveScenarioDraft).mockReset()
  vi.mocked(deleteScenario).mockReset().mockResolvedValue()
})

describe('saving a new scenario', () => {
  it('writes the title, tempo and notes under the signed-in account', async () => {
    vi.mocked(saveScenarioDraft).mockResolvedValue({
      scenarioId: 'abc',
      versionId: 'abc-v1',
      versionNumber: 1,
    })
    renderEditor()

    await userEvent.type(screen.getByLabelText('Title'), 'Chromatic Warmup')
    fireEvent.change(screen.getByLabelText('Tempo (BPM)'), { target: { value: '90' } })
    fireEvent.pointerDown(screen.getByRole('application'), { button: 0, ...at(2, 60) })
    await userEvent.click(screen.getByRole('button', { name: 'Save Scenario' }))

    expect(await screen.findByText('Saved as version 1.')).toBeInTheDocument()
    expect(saveScenarioDraft).toHaveBeenCalledOnce()
    const { uid, draft, scenarioId } = vi.mocked(saveScenarioDraft).mock.calls[0][0]
    expect(uid).toBe('user-1')
    expect(scenarioId).toBeNull()
    expect(draft.title).toBe('Chromatic Warmup')
    expect(draft.chart.tempoMap[0]).toMatchObject({ atBeat: 0, bpm: 90 })
    expect(draft.chart.parts[0].notes).toEqual([
      expect.objectContaining({ midiPitch: 60, startBeat: 2, durationBeats: 1 }),
    ])
  })

  it('keeps the saved scenario open, so the next save is a new version of it', async () => {
    vi.mocked(saveScenarioDraft).mockResolvedValue({
      scenarioId: 'abc',
      versionId: 'abc-v1',
      versionNumber: 1,
    })
    renderEditor()

    await userEvent.type(screen.getByLabelText('Title'), 'Chromatic Warmup')
    await userEvent.click(screen.getByRole('button', { name: 'Save Scenario' }))

    expect(await screen.findByRole('button', { name: 'Save Version' })).toBeDisabled()
    expect(screen.getByTestId('location')).toHaveTextContent('scenario=abc')
    // The draft in hand is what was just written, so it is not read back.
    expect(loadScenario).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Title')).toHaveValue('Chromatic Warmup')

    await userEvent.type(screen.getByLabelText('Title'), ' II')
    await userEvent.click(screen.getByRole('button', { name: 'Save Version' }))

    expect(vi.mocked(saveScenarioDraft).mock.calls[1][0]).toMatchObject({
      uid: 'user-1',
      scenarioId: 'abc',
    })
  })

  it('reports a failed save and leaves the draft as it was', async () => {
    vi.mocked(saveScenarioDraft).mockRejectedValue(new Error('Firestore rejected the write.'))
    renderEditor()

    await userEvent.type(screen.getByLabelText('Title'), 'Chromatic Warmup')
    await userEvent.click(screen.getByRole('button', { name: 'Save Scenario' }))

    expect(await screen.findByText('Firestore rejected the write.')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Chromatic Warmup')
    expect(screen.getByTestId('location')).not.toHaveTextContent('scenario=')
  })

  it('is unavailable while signed out', async () => {
    renderAtRoute(<EditorPanel scenarioId={null} onSaved={() => {}} onStartNew={() => {}} />, {
      path: '/scenario_editor',
      auth: SIGNED_OUT,
    })

    await userEvent.type(screen.getByLabelText('Title'), 'Chromatic Warmup')

    expect(screen.getByRole('button', { name: 'Save Scenario' })).toBeDisabled()
    expect(screen.getByText('Sign in to save this scenario to your library.')).toBeInTheDocument()
    expect(saveScenarioDraft).not.toHaveBeenCalled()
  })
})

describe('reopening a saved scenario', () => {
  it('restores the notes and metadata that were saved', async () => {
    vi.mocked(loadScenario).mockResolvedValue(savedDocuments())
    renderEditor('/scenario_editor?tab=new&scenario=abc')

    expect(screen.getByText('Loading scenario...')).toBeInTheDocument()
    expect(await screen.findByLabelText('Title')).toHaveValue('Chromatic Warmup')
    expect(loadScenario).toHaveBeenCalledWith('abc')
    expect(screen.getByLabelText('Description')).toHaveValue('Four bars, slowly.')
    expect(screen.getByLabelText('Instrument')).toHaveValue('guitar')
    expect(screen.getByLabelText('Visibility')).toHaveValue('public')
    expect(screen.getByLabelText(/Difficulty/)).toHaveValue('6')
    expect(screen.getByLabelText('Tempo (BPM)')).toHaveValue(90)
    expect(screen.getByText(/^2 notes · 90 BPM · 4\/4/)).toBeInTheDocument()
    expect(screen.getByTitle(/^C4 at beat 0$/)).toBeInTheDocument()
    expect(screen.getByTitle(/^E4 at beat 2$/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Editing Scenario' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('shows an error, not a blank editor, when the scenario is gone', async () => {
    vi.mocked(loadScenario).mockRejectedValue(new Error('That scenario no longer exists.'))
    renderEditor('/scenario_editor?tab=new&scenario=missing')

    expect(await screen.findByText('That scenario no longer exists.')).toBeInTheDocument()
  })

  it('returns to the blank default state from New Scenario', async () => {
    vi.mocked(loadScenario).mockResolvedValue(savedDocuments())
    renderEditor('/scenario_editor?tab=new&scenario=abc')

    await userEvent.click(await screen.findByRole('button', { name: 'New Scenario' }))

    expect(screen.getByLabelText('Title')).toHaveValue('')
    expect(screen.getByText(/^0 notes · 120 BPM · 4\/4/)).toBeInTheDocument()
    expect(screen.getByTestId('location')).not.toHaveTextContent('scenario=')
  })
})

describe('Your Library', () => {
  it('lists a saved scenario and opens it in the editor', async () => {
    const { scenario, version } = savedDocuments()
    vi.mocked(listMyScenarios).mockResolvedValue([scenario])
    vi.mocked(loadScenario).mockResolvedValue({ scenario, version })
    renderEditor('/scenario_editor?tab=library')

    expect(await screen.findByRole('heading', { name: 'Chromatic Warmup' })).toBeInTheDocument()
    expect(listMyScenarios).toHaveBeenCalledWith('user-1')
    expect(screen.getByText(/Guitar · public · version 2 · difficulty 6\/10/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Open in Editor' }))

    expect(await screen.findByLabelText('Title')).toHaveValue('Chromatic Warmup')
    expect(loadScenario).toHaveBeenCalledWith('abc')
    expect(screen.getByTestId('location')).toHaveTextContent('scenario=abc')
  })

  it('deletes a scenario after confirmation and drops it from the list', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(listMyScenarios).mockResolvedValue([savedDocuments().scenario])
    renderEditor('/scenario_editor?tab=library&scenario=abc')

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Chromatic Warmup' }))

    expect(await screen.findByText('Your library is empty')).toBeInTheDocument()
    expect(confirm).toHaveBeenCalledOnce()
    expect(deleteScenario).toHaveBeenCalledWith({ uid: 'user-1', scenarioId: 'abc' })
    // It was also the scenario open in the editor tab, which lets go of it.
    expect(screen.getByTestId('location')).not.toHaveTextContent('scenario=')
    expect(screen.getByRole('tab', { name: 'New Scenario' })).toBeInTheDocument()
    confirm.mockRestore()
  })

  it('keeps the scenario when the confirmation is declined', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    vi.mocked(listMyScenarios).mockResolvedValue([savedDocuments().scenario])
    renderEditor('/scenario_editor?tab=library')

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Chromatic Warmup' }))

    expect(deleteScenario).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Chromatic Warmup' })).toBeInTheDocument()
    confirm.mockRestore()
  })

  it('reports a failed delete and leaves the scenario listed', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(listMyScenarios).mockResolvedValue([savedDocuments().scenario])
    vi.mocked(deleteScenario).mockRejectedValue(new Error('Firestore rejected the delete.'))
    renderEditor('/scenario_editor?tab=library')

    await userEvent.click(await screen.findByRole('button', { name: 'Delete Chromatic Warmup' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Firestore rejected the delete.')
    expect(screen.getByRole('heading', { name: 'Chromatic Warmup' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Chromatic Warmup' })).toBeEnabled()
    confirm.mockRestore()
  })
})
