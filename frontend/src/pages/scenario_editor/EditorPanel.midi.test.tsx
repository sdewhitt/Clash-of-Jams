/**
 * User stories #26 and #30 through the editor: importing a .mid file, choosing a track from a
 * multi-track one, exporting back to .mid, and editing a note's velocity.
 *
 * The file parsing and writing are tested beside lib/import/midiFile; these check the pieces
 * are wired into the page.
 */
import { Midi } from '@tonejs/midi'
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { downloadBytes } from '@/lib/download'
import { midiTrackImport, readMidiFile } from '@/lib/import/midiFile'
import { EditorPanel } from '@/pages/scenario_editor/EditorPanel'
import { renderWithAuth, signedIn } from '@/test/render'

vi.mock('@/lib/scenarios/store', () => ({ loadScenario: vi.fn(), saveScenarioDraft: vi.fn() }))
vi.mock('@/lib/play/settings', () => ({
  loadMidiLatencyMs: vi.fn(async () => 0),
  saveMidiLatencyMs: vi.fn(async () => {}),
}))
vi.mock('@/lib/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/download')>()),
  downloadBytes: vi.fn(),
}))

function midiFile(name: string, tracks: [string, number[]][], bpm = 96) {
  const midi = new Midi()
  midi.header.name = 'Two Hands'
  midi.header.tempos.push({ ticks: 0, bpm })
  midi.header.update()
  for (const [trackName, pitches] of tracks) {
    const track = midi.addTrack()
    track.name = trackName
    pitches.forEach((pitch, at) =>
      track.addNote({ midi: pitch, ticks: at * 480, durationTicks: 480, velocity: 0.5 }),
    )
  }
  return new File([midi.toArray() as BlobPart], name, { type: 'audio/midi' })
}

function renderPanel() {
  return renderWithAuth(<EditorPanel scenarioId={null} onSaved={vi.fn()} onStartNew={vi.fn()} />, {
    auth: signedIn(),
  })
}

beforeEach(() => {
  vi.mocked(downloadBytes).mockReset()
})

describe('MIDI import', () => {
  it('fills the editor from a single-track file', async () => {
    renderPanel()

    await userEvent.upload(
      screen.getByLabelText('MIDI file'),
      midiFile('song.mid', [['Piano', [60, 62, 64]]]),
    )

    expect(await screen.findByText('Imported 3 notes from song.mid.')).toBeInTheDocument()
    expect(screen.getByLabelText('Title')).toHaveValue('Two Hands')
    expect(screen.getByLabelText('Tempo (BPM)')).toHaveValue(96)
  })

  it('asks which track to use instead of merging a multi-track file', async () => {
    renderPanel()

    await userEvent.upload(
      screen.getByLabelText('MIDI file'),
      midiFile('duet.mid', [
        ['Right Hand', [72, 74]],
        ['Left Hand', [48, 50, 52]],
      ]),
    )
    const picker = await screen.findByRole('dialog', { name: 'Choose a track' })
    fireEvent.click(within(picker).getByRole('button', { name: /Left Hand/ }))

    expect(await screen.findByText('Imported 3 notes from duet.mid.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('reports a file that is not MIDI and keeps the scenario as it was', async () => {
    renderPanel()
    await userEvent.upload(screen.getByLabelText('MIDI file'), midiFile('a.mid', [['Piano', [60]]]))
    await screen.findByText('Imported 1 note from a.mid.')

    await userEvent.upload(screen.getByLabelText('MIDI file'), new File(['hello'], 'b.mid'))

    expect(await screen.findByText('This file is not a MIDI file.')).toBeInTheDocument()
    expect(screen.getByText(/^1 note ·/)).toBeInTheDocument()
  })
})

describe('MIDI export', () => {
  it('is unavailable for an empty scenario', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: 'Export MIDI' })).toBeDisabled()
  })

  it('downloads the chart as a .mid file named after the scenario', async () => {
    renderPanel()
    await userEvent.upload(
      screen.getByLabelText('MIDI file'),
      midiFile('song.mid', [['Piano', [60, 67]]]),
    )
    await screen.findByText('Imported 2 notes from song.mid.')

    fireEvent.click(screen.getByRole('button', { name: 'Export MIDI' }))

    const [bytes, fileName, type] = vi.mocked(downloadBytes).mock.calls[0]
    expect(fileName).toBe('Two Hands.mid')
    expect(type).toBe('audio/midi')
    const exported = midiTrackImport(readMidiFile(bytes as Uint8Array), 0)
    expect(exported.chart.parts[0].notes.map((note) => note.midiPitch)).toEqual([60, 67])
  })
})

describe('velocity editing', () => {
  it('changes the selected note velocity from the toolbar, and it is kept on export', async () => {
    renderPanel()
    await userEvent.upload(
      screen.getByLabelText('MIDI file'),
      midiFile('song.mid', [['Piano', [60]]]),
    )
    await screen.findByText('Imported 1 note from song.mid.')
    const slider = screen.getByLabelText('Velocity')
    expect(slider).toBeDisabled()

    fireEvent.pointerDown(screen.getByTitle(/^C4 at beat 0/), { button: 0 })
    fireEvent.pointerUp(screen.getByRole('application'))
    fireEvent.change(slider, { target: { value: '20' } })

    expect(slider).toHaveValue('20')
    fireEvent.click(screen.getByRole('button', { name: 'Export MIDI' }))
    const [bytes] = vi.mocked(downloadBytes).mock.calls[0]
    const exported = midiTrackImport(readMidiFile(bytes as Uint8Array), 0)
    expect(exported.chart.parts[0].notes[0]).toMatchObject({ midiPitch: 60, velocity: 20 })
  })
})
