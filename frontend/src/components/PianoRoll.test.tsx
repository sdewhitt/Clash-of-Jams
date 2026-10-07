/**
 * User story #25: editing notes with the mouse.
 *
 * jsdom gives every element a zero-origin, zero-size rect, so a pointer event's
 * clientX/clientY land directly on the roll's own beat and pitch arithmetic --
 * which is exactly the mapping these tests are checking.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { PianoRoll } from '@/components/PianoRoll'
import { EDITOR_LIMITS, addNote } from '@/lib/chart/edits'
import { emptyChart } from '@/lib/schema/collections'
import type { NoteChart } from '@/lib/schema/types'

const BEAT_WIDTH = 64
const ROW_HEIGHT = 18
const TOP_PITCH = EDITOR_LIMITS.maxPitch

/** Client coordinates for the given beat and pitch, mirroring the roll's grid. */
function at(beat: number, pitch: number) {
  return { clientX: beat * BEAT_WIDTH, clientY: (TOP_PITCH - pitch) * ROW_HEIGHT }
}

/**
 * The roll is controlled, so the harness holds the chart and feeds edits back
 * in. Without that a second gesture would still see the pre-edit chart.
 */
function Harness({ initial, spy }: { initial: NoteChart; spy: (next: NoteChart) => void }) {
  const [chart, setChart] = useState(initial)
  return (
    <PianoRoll
      chart={chart}
      partId="lead"
      onChange={(next) => {
        spy(next)
        setChart(next)
      }}
    />
  )
}

function renderRoll(chart: NoteChart = emptyChart('piano')) {
  const onChange = vi.fn<(next: NoteChart) => void>()
  const view = render(<Harness initial={chart} spy={onChange} />)
  return { onChange, grid: screen.getByRole('application'), view }
}

function notesFrom(onChange: ReturnType<typeof vi.fn>) {
  const next = onChange.mock.lastCall?.[0] as NoteChart
  return next.parts[0].notes
}

describe('placing notes', () => {
  it('adds one note where the grid was pressed', () => {
    const { onChange, grid } = renderRoll()

    fireEvent.pointerDown(grid, { button: 0, ...at(2, 60) })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(notesFrom(onChange)).toHaveLength(1)
    expect(notesFrom(onChange)[0]).toMatchObject({
      midiPitch: 60,
      startBeat: 2,
      durationBeats: 1,
    })
  })

  it('snaps the onset down to the chosen grid division', async () => {
    const { onChange, grid } = renderRoll()

    fireEvent.pointerDown(grid, { button: 0, ...at(1.3, 60) })

    expect(notesFrom(onChange).map((note) => note.startBeat)).toEqual([1.25])

    await userEvent.selectOptions(screen.getByLabelText('Snap'), '1')
    fireEvent.pointerDown(grid, { button: 0, ...at(1.9, 62) })

    expect(notesFrom(onChange).map((note) => note.startBeat)).toEqual([1, 1.25])
  })

  it('uses the chosen length for a new note', async () => {
    const { onChange, grid } = renderRoll()

    await userEvent.selectOptions(screen.getByLabelText('New note'), '2')
    fireEvent.pointerDown(grid, { button: 0, ...at(0, 60) })

    expect(notesFrom(onChange)[0].durationBeats).toBe(2)
  })

  it('ignores a press with a button other than the primary one', () => {
    const { onChange, grid } = renderRoll()

    fireEvent.pointerDown(grid, { button: 2, ...at(0, 60) })

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('dragging notes', () => {
  const oneNote = addNote(emptyChart('piano'), 'lead', {
    midiPitch: 60,
    startBeat: 0,
    durationBeats: 1,
  })

  function noteElement() {
    return screen.getByTitle(/^C4 at beat 0$/)
  }

  it('moves a note to the pitch and beat it was dragged to', () => {
    const { onChange, grid } = renderRoll(oneNote)

    fireEvent.pointerDown(noteElement(), { button: 0, ...at(0, 60) })
    fireEvent.pointerMove(grid, at(3, 67))
    fireEvent.pointerUp(grid, at(3, 67))

    expect(notesFrom(onChange)).toHaveLength(1)
    expect(notesFrom(onChange)[0]).toMatchObject({
      midiPitch: 67,
      startBeat: 3,
      durationBeats: 1,
    })
  })

  it('keeps the grab point, so a note dragged by its middle does not jump', () => {
    const twoBeats = addNote(emptyChart('piano'), 'lead', {
      midiPitch: 60,
      startBeat: 0,
      durationBeats: 2,
    })
    const { onChange, grid } = renderRoll(twoBeats)

    fireEvent.pointerDown(screen.getByTitle(/^C4 at beat 0$/), { button: 0, ...at(1, 60) })
    fireEvent.pointerMove(grid, at(5, 60))
    fireEvent.pointerUp(grid, at(5, 60))

    expect(notesFrom(onChange)[0].startBeat).toBe(4)
  })

  it('resizes from the right edge without moving the note', () => {
    const { onChange, grid } = renderRoll(oneNote)

    const handle = noteElement().firstElementChild as HTMLElement
    fireEvent.pointerDown(handle, { button: 0, ...at(1, 60) })
    fireEvent.pointerMove(grid, at(3, 60))
    fireEvent.pointerUp(grid, at(3, 60))

    expect(notesFrom(onChange)[0]).toMatchObject({
      midiPitch: 60,
      startBeat: 0,
      durationBeats: 3,
    })
  })

  it('does not commit anything until the drag ends', () => {
    const { onChange, grid } = renderRoll(oneNote)

    fireEvent.pointerDown(noteElement(), { button: 0, ...at(0, 60) })
    fireEvent.pointerMove(grid, at(3, 67))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('refuses a drag above the top of the range', () => {
    const { onChange, grid } = renderRoll(oneNote)

    fireEvent.pointerDown(noteElement(), { button: 0, ...at(0, 60) })
    fireEvent.pointerMove(grid, at(0, TOP_PITCH + 12))
    fireEvent.pointerUp(grid, at(0, TOP_PITCH + 12))

    // Clamped to the top row rather than stored out of range.
    expect(notesFrom(onChange)[0].midiPitch).toBe(TOP_PITCH)
  })
})

describe('removing notes', () => {
  const twoNotes = addNote(
    addNote(emptyChart('piano'), 'lead', { midiPitch: 60, startBeat: 0, durationBeats: 1 }),
    'lead',
    { midiPitch: 64, startBeat: 2, durationBeats: 1 },
  )

  it('deletes the note that was right-clicked, leaving the other', () => {
    const { onChange } = renderRoll(twoNotes)

    fireEvent.contextMenu(screen.getByTitle(/^C4 at beat 0$/))

    expect(notesFrom(onChange)).toHaveLength(1)
    expect(notesFrom(onChange)[0].midiPitch).toBe(64)
  })

  it('deletes the selected note with the Delete key', () => {
    const { onChange, grid } = renderRoll(twoNotes)

    fireEvent.pointerDown(screen.getByTitle(/^E4 at beat 2$/), { button: 0, ...at(2, 64) })
    fireEvent.pointerUp(grid, at(2, 64))
    onChange.mockClear()
    fireEvent.keyDown(grid, { key: 'Delete' })

    expect(notesFrom(onChange)).toHaveLength(1)
    expect(notesFrom(onChange)[0].midiPitch).toBe(60)
  })

  it('leaves the chart alone when the Delete key arrives with nothing selected', () => {
    const { onChange, grid } = renderRoll(twoNotes)

    fireEvent.keyDown(grid, { key: 'Delete' })

    expect(onChange).not.toHaveBeenCalled()
  })

  it('enables the toolbar delete button only once a note is selected', () => {
    const { grid } = renderRoll(twoNotes)

    const button = screen.getByRole('button', { name: 'Delete note' })
    expect(button).toBeDisabled()

    fireEvent.pointerDown(screen.getByTitle(/^C4 at beat 0$/), { button: 0, ...at(0, 60) })
    fireEvent.pointerUp(grid, at(0, 60))

    expect(button).toBeEnabled()
  })
})

describe('keyboard nudging', () => {
  const oneNote = addNote(emptyChart('piano'), 'lead', {
    midiPitch: 60,
    startBeat: 1,
    durationBeats: 1,
  })

  it('moves the selected note by a semitone and by one snap step', () => {
    const { onChange, grid } = renderRoll(oneNote)

    fireEvent.pointerDown(screen.getByTitle(/^C4 at beat 1$/), { button: 0, ...at(1, 60) })
    fireEvent.pointerUp(grid, at(1, 60))
    onChange.mockClear()

    fireEvent.keyDown(grid, { key: 'ArrowUp' })
    expect(notesFrom(onChange)[0].midiPitch).toBe(61)

    fireEvent.keyDown(grid, { key: 'ArrowLeft' })
    expect(notesFrom(onChange)[0].startBeat).toBeCloseTo(0.75)
  })
})
