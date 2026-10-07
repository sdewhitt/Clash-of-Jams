/**
 * User story #25: adding, moving, resizing and deleting notes.
 *
 * These exercise the chart edits directly rather than through the piano roll,
 * since the ordering and range rules are what the rest of the app depends on.
 */
import { describe, expect, it } from 'vitest'

import { EDITOR_LIMITS, addNote, moveNote, removeNote, resizeNote } from '@/lib/chart/edits'
import { emptyChart } from '@/lib/schema/collections'
import type { NoteChart } from '@/lib/schema/types'

const PART = 'lead'

function chartWith(...notes: { midiPitch: number; startBeat: number; durationBeats?: number }[]) {
  return notes.reduce<NoteChart>(
    (chart, note) =>
      addNote(chart, PART, {
        midiPitch: note.midiPitch,
        startBeat: note.startBeat,
        durationBeats: note.durationBeats ?? 1,
      }),
    emptyChart('piano'),
  )
}

function notesOf(chart: NoteChart) {
  return chart.parts[0].notes
}

describe('addNote', () => {
  it('inserts exactly one note with the requested pitch, start and duration', () => {
    const chart = addNote(emptyChart('piano'), PART, {
      midiPitch: 60,
      startBeat: 2,
      durationBeats: 0.5,
    })

    expect(notesOf(chart)).toHaveLength(1)
    expect(notesOf(chart)[0]).toMatchObject({
      index: 0,
      midiPitch: 60,
      startBeat: 2,
      durationBeats: 0.5,
    })
  })

  it('leaves the chart it was given untouched', () => {
    const before = emptyChart('piano')

    addNote(before, PART, { midiPitch: 60, startBeat: 0, durationBeats: 1 })

    expect(notesOf(before)).toHaveLength(0)
  })

  it('returns notes in ascending start order however they were added', () => {
    const chart = chartWith(
      { midiPitch: 60, startBeat: 3 },
      { midiPitch: 62, startBeat: 0 },
      { midiPitch: 64, startBeat: 1.5 },
    )

    expect(notesOf(chart).map((note) => note.startBeat)).toEqual([0, 1.5, 3])
    expect(notesOf(chart).map((note) => note.index)).toEqual([0, 1, 2])
  })

  it('ignores an unknown part rather than inventing one', () => {
    const before = emptyChart('piano')

    const after = addNote(before, 'not-a-part', { midiPitch: 60, startBeat: 0, durationBeats: 1 })

    expect(after).toBe(before)
    expect(after.parts).toHaveLength(1)
  })
})

describe('range rejection', () => {
  const cases = [
    ['below the lowest pitch', { midiPitch: EDITOR_LIMITS.minPitch - 1, startBeat: 0 }],
    ['above the highest pitch', { midiPitch: EDITOR_LIMITS.maxPitch + 1, startBeat: 0 }],
    ['before beat zero', { midiPitch: 60, startBeat: -1 }],
    ['past the end of the grid', { midiPitch: 60, startBeat: EDITOR_LIMITS.maxBeat }],
  ] as const

  it.each(cases)('rejects a note %s rather than storing it', (_label, note) => {
    const before = emptyChart('piano')

    const after = addNote(before, PART, { ...note, durationBeats: 1 })

    expect(after).toBe(before)
    expect(notesOf(after)).toHaveLength(0)
  })

  it('rejects a duration shorter than the smallest the editor allows', () => {
    const before = emptyChart('piano')

    const after = addNote(before, PART, { midiPitch: 60, startBeat: 0, durationBeats: 0 })

    expect(after).toBe(before)
  })

  it('rejects a move that would leave the pitch range, keeping the old position', () => {
    const chart = chartWith({ midiPitch: 60, startBeat: 0 })

    const after = moveNote(chart, PART, 0, { midiPitch: EDITOR_LIMITS.maxPitch + 1, startBeat: 0 })

    expect(after).toBe(chart)
    expect(notesOf(after)[0].midiPitch).toBe(60)
  })
})

describe('removeNote', () => {
  it('removes only that note and leaves the others unchanged', () => {
    const chart = chartWith(
      { midiPitch: 60, startBeat: 0 },
      { midiPitch: 62, startBeat: 1 },
      { midiPitch: 64, startBeat: 2 },
    )

    const after = removeNote(chart, PART, 1)

    expect(notesOf(after)).toHaveLength(2)
    expect(notesOf(after).map((note) => note.midiPitch)).toEqual([60, 64])
    expect(notesOf(after).map((note) => note.index)).toEqual([0, 1])
  })

  it('ignores an index that is not there', () => {
    const chart = chartWith({ midiPitch: 60, startBeat: 0 })

    expect(removeNote(chart, PART, 9)).toBe(chart)
  })
})

describe('moveNote', () => {
  it('updates pitch and start time together', () => {
    const chart = chartWith({ midiPitch: 60, startBeat: 0, durationBeats: 2 })

    const after = moveNote(chart, PART, 0, { midiPitch: 67, startBeat: 4 })

    expect(notesOf(after)[0]).toMatchObject({ midiPitch: 67, startBeat: 4, durationBeats: 2 })
  })

  it('reorders the part when a note is moved past another', () => {
    const chart = chartWith({ midiPitch: 60, startBeat: 0 }, { midiPitch: 62, startBeat: 1 })

    const after = moveNote(chart, PART, 0, { midiPitch: 60, startBeat: 8 })

    expect(notesOf(after).map((note) => note.midiPitch)).toEqual([62, 60])
    expect(notesOf(after).map((note) => note.index)).toEqual([0, 1])
  })
})

describe('resizeNote', () => {
  it('changes the duration without altering pitch or start', () => {
    const chart = chartWith({ midiPitch: 60, startBeat: 2, durationBeats: 1 })

    const after = resizeNote(chart, PART, 0, 3.5)

    expect(notesOf(after)[0]).toMatchObject({ midiPitch: 60, startBeat: 2, durationBeats: 3.5 })
  })

  it('rejects a duration below the minimum, keeping the old one', () => {
    const chart = chartWith({ midiPitch: 60, startBeat: 0, durationBeats: 1 })

    const after = resizeNote(chart, PART, 0, 0)

    expect(after).toBe(chart)
    expect(notesOf(after)[0].durationBeats).toBe(1)
  })
})
