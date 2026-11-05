/**
 * The sheet music editor, driven the way an author uses it. Engraving details (spelling,
 * ties, beams) are tested in lib/notation; these check that clicks and keys become the
 * right chart edits.
 *
 * jsdom has no layout, so the SVG sits at the origin and client coordinates are SVG
 * coordinates; the engrave helpers say where a beat and staff position land.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { SheetMusic } from '@/components/SheetMusic'
import { addNotes } from '@/lib/chart/edits'
import type { NoteInput } from '@/lib/chart/edits'
import { layoutScore, staffY, tickToX } from '@/lib/notation/engrave'
import { buildScore } from '@/lib/notation/score'
import { emptyChart } from '@/lib/schema/collections'
import type { Instrument, NoteChart } from '@/lib/schema/types'

function chartOf(notes: NoteInput[] = [], keySignature = 0) {
  return addNotes({ ...emptyChart('piano'), keySignature }, 'lead', notes)
}

function renderSheet(
  initial: NoteChart = chartOf(),
  { instrument = 'piano', readOnly = false }: { instrument?: Instrument; readOnly?: boolean } = {},
) {
  const latest = { chart: initial }
  function Harness() {
    const [chart, setChart] = useState(initial)
    return (
      <SheetMusic
        chart={chart}
        partId="lead"
        instrument={instrument}
        readOnly={readOnly}
        onChange={(next) => {
          latest.chart = next
          setChart(next)
        }}
      />
    )
  }
  render(<Harness />)
  const notes = () =>
    latest.chart.parts[0].notes.map(({ midiPitch, startBeat, durationBeats }) => ({
      midiPitch,
      startBeat,
      durationBeats,
    }))
  return { notes, score: screen.getByRole('application') }
}

/** Where a beat and staff position sit on the first system of a treble-clef score. */
function at(chart: NoteChart, beat: number, position: number) {
  const system = layoutScore(buildScore(chart, 'lead'), 'treble', 960).systems[0]
  return { clientX: tickToX(system, beat * 16) + 8, clientY: staffY(system, position) }
}

describe('reading', () => {
  it('names each note by its spelling in the key', () => {
    renderSheet(chartOf([{ midiPitch: 70, startBeat: 0, durationBeats: 1 }], -1))

    expect(screen.getByRole('button', { name: 'Bb4 at beat 0' })).toBeInTheDocument()
    expect(screen.getByRole('application')).toHaveAccessibleName('Sheet music, 1 note placed')
  })

  it('picks the guitar clef for a guitar scenario', () => {
    renderSheet(chartOf(), { instrument: 'guitar' })

    expect(screen.getByLabelText('Clef')).toHaveDisplayValue('Auto (Guitar (treble 8vb))')
  })
})

describe('writing with the mouse', () => {
  it('writes the chosen length at the clicked line or space', async () => {
    const chart = chartOf()
    const { notes } = renderSheet(chart)

    await userEvent.click(screen.getByRole('button', { name: 'Half note' }))
    // Position 4 is the middle line, B4 in treble.
    fireEvent.pointerDown(document.querySelector('svg')!, { button: 0, ...at(chart, 0, 4) })

    expect(notes()).toEqual([{ midiPitch: 71, startBeat: 0, durationBeats: 2 }])
    expect(screen.getByRole('button', { name: 'B4 at beat 0' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('applies an armed accidental to the next note only', async () => {
    const chart = chartOf()
    const { notes } = renderSheet(chart)

    await userEvent.click(screen.getByRole('button', { name: 'Flat' }))
    fireEvent.pointerDown(document.querySelector('svg')!, { button: 0, ...at(chart, 0, 4) })

    expect(notes()[0].midiPitch).toBe(70)
    expect(screen.getByRole('button', { name: 'Flat' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('deletes a note on right-click', () => {
    const { notes } = renderSheet(chartOf([{ midiPitch: 72, startBeat: 0, durationBeats: 1 }]))

    fireEvent.contextMenu(screen.getByRole('button', { name: 'C5 at beat 0' }))

    expect(notes()).toEqual([])
  })
})

describe('writing with the keyboard', () => {
  it('writes letters at the cursor, each in the octave nearest the last', () => {
    const { notes, score } = renderSheet()

    for (const key of ['c', 'e', 'g', 'c']) fireEvent.keyDown(score, { key })

    expect(notes().map((note) => [note.midiPitch, note.startBeat])).toEqual([
      [72, 0],
      [76, 1],
      [79, 2],
      [84, 3],
    ])
  })

  it('adds the letter above the selected note to its chord with Shift', () => {
    const { notes, score } = renderSheet()

    fireEvent.keyDown(score, { key: 'c' })
    fireEvent.keyDown(score, { key: 'E', shiftKey: true })

    expect(notes().map((note) => [note.midiPitch, note.startBeat])).toEqual([
      [72, 0],
      [76, 0],
    ])
  })

  it('takes lengths from the number keys, dotted with a period, and skips rests with 0', () => {
    const { notes, score } = renderSheet()

    fireEvent.keyDown(score, { key: '4' })
    fireEvent.keyDown(score, { key: 'c' })
    fireEvent.keyDown(score, { key: '0' })
    fireEvent.keyDown(score, { key: '6' })
    fireEvent.keyDown(score, { key: '.' })
    fireEvent.keyDown(score, { key: 'd' })

    expect(notes()).toEqual([
      { midiPitch: 72, startBeat: 0, durationBeats: 0.5 },
      { midiPitch: 74, startBeat: 1, durationBeats: 3 },
    ])
  })

  it('changes the selected note: length, pitch by semitone or octave, and delete', () => {
    const { notes, score } = renderSheet(
      chartOf([{ midiPitch: 60, startBeat: 0, durationBeats: 1 }]),
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'C4 at beat 0' }), { button: 0 })
    fireEvent.pointerUp(document.querySelector('svg')!)
    fireEvent.keyDown(score, { key: '6' })
    expect(notes()[0].durationBeats).toBe(2)

    fireEvent.keyDown(score, { key: 'ArrowUp' })
    expect(notes()[0].midiPitch).toBe(61)
    fireEvent.keyDown(score, { key: 'ArrowDown', ctrlKey: true })
    expect(notes()[0].midiPitch).toBe(49)

    fireEvent.keyDown(score, { key: 'Delete' })
    expect(notes()).toEqual([])
  })

  it('resizes the whole chord, not just the selected note', () => {
    const { notes, score } = renderSheet(
      chartOf([
        { midiPitch: 60, startBeat: 0, durationBeats: 1 },
        { midiPitch: 64, startBeat: 0, durationBeats: 1 },
      ]),
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'E4 at beat 0' }), { button: 0 })
    fireEvent.pointerUp(document.querySelector('svg')!)
    fireEvent.keyDown(score, { key: '7' })

    expect(notes().map((note) => note.durationBeats)).toEqual([4, 4])
  })

  it('moves the selection with the left and right arrows', () => {
    const { score } = renderSheet(
      chartOf([
        { midiPitch: 60, startBeat: 0, durationBeats: 1 },
        { midiPitch: 62, startBeat: 1, durationBeats: 1 },
      ]),
    )

    fireEvent.keyDown(score, { key: 'ArrowLeft' })
    expect(screen.getByRole('button', { name: 'D4 at beat 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.keyDown(score, { key: 'ArrowLeft' })
    expect(screen.getByRole('button', { name: 'C4 at beat 0' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('accepts nothing while read-only', () => {
    const { notes, score } = renderSheet(chartOf(), { readOnly: true })

    fireEvent.keyDown(score, { key: 'c' })

    expect(notes()).toEqual([])
    expect(screen.getByRole('button', { name: 'Quarter note' })).toBeDisabled()
  })
})
