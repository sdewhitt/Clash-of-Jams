/**
 * User story #26: notes recorded from a MIDI controller land in the chart in beats, with the
 * calibrated latency taken off, and keep their velocity as dynamics.
 */
import { describe, expect, it } from 'vitest'

import { MidiRecorder } from '@/audio/midi-input'
import { addNotes, setVelocity } from '@/lib/chart/edits'
import { beatToMs, msToBeat } from '@/lib/chart/notes'
import { recordedToNotes } from '@/lib/chart/record'
import { emptyChart } from '@/lib/schema/collections'
import type { NoteChart } from '@/lib/schema/types'

const PART = 'lead'
const at120 = emptyChart('piano')
/** 120bpm for four beats, then 60bpm. */
const withTempoChange: NoteChart = {
  ...at120,
  tempoMap: [
    { atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 },
    { atBeat: 4, bpm: 60, timeSigNum: 4, timeSigDen: 4 },
  ],
}

function record(messages: [number[], number][]) {
  const recorder = new MidiRecorder()
  recorder.start(1000)
  for (const [data, time] of messages) recorder.handleMessage(data, time)
  return recorder.takeNotes(1000 + 60_000)
}

describe('msToBeat', () => {
  it('inverts beatToMs, across a tempo change', () => {
    for (const beat of [0, 1.5, 4, 5.25, 9]) {
      expect(msToBeat(withTempoChange, beatToMs(withTempoChange, beat))).toBeCloseTo(beat, 9)
    }
  })

  it('places times before beat 0 at negative beats', () => {
    expect(msToBeat(at120, -250)).toBeCloseTo(-0.5)
  })
})

describe('recording from a MIDI controller', () => {
  it('turns a note-on and its note-off into exactly one note', () => {
    // Beat 0 is at 1000ms; at 120bpm a beat is 500ms.
    const recorded = record([
      [[0x90, 64, 100], 2000],
      [[0x80, 64, 0], 2500],
    ])

    expect(recordedToNotes(recorded, at120)).toEqual([
      { midiPitch: 64, startBeat: 2, durationBeats: 1, velocity: 100 },
    ])
  })

  it('treats a note-on with velocity 0 as a note-off', () => {
    const recorded = record([
      [[0x90, 60, 90], 1000],
      [[0x90, 60, 0], 1250],
    ])

    expect(recordedToNotes(recorded, at120)).toEqual([
      { midiPitch: 60, startBeat: 0, durationBeats: 0.5, velocity: 90 },
    ])
  })

  it('converts milliseconds to beats through the tempo map, across a tempo change', () => {
    // Beat 4 is at 2000ms; after it a beat lasts 1000ms, so 3000ms is beat 5.
    const notes = recordedToNotes(
      [{ midiPitch: 62, startMs: 3000, durationMs: 2000, velocity: 70 }],
      withTempoChange,
    )

    expect(notes[0]).toMatchObject({ startBeat: 5, durationBeats: 2 })
  })

  it('measures a note held over the tempo change in both tempos', () => {
    // 1500ms to 3000ms: beats 3 to 4 at 120bpm, then 4 to 5 at 60bpm.
    const notes = recordedToNotes(
      [{ midiPitch: 62, startMs: 1500, durationMs: 1500, velocity: 70 }],
      withTempoChange,
    )

    expect(notes[0]).toMatchObject({ startBeat: 3, durationBeats: 2 })
  })

  it('subtracts the calibration offset from every onset', () => {
    const played = [{ midiPitch: 60, startMs: 1030, durationMs: 500, velocity: 80 }]

    expect(recordedToNotes(played, at120, { offsetMs: 30 })[0].startBeat).toBe(2)
    expect(recordedToNotes(played, at120, { offsetMs: 0 })[0].startBeat).toBe(2.06)
  })

  it('snaps onsets and lengths to the grid when asked', () => {
    const notes = recordedToNotes(
      [{ midiPitch: 60, startMs: 1060, durationMs: 210, velocity: 80 }],
      at120,
      { snapBeats: 0.25 },
    )

    expect(notes[0]).toMatchObject({ startBeat: 2, durationBeats: 0.5 })
  })

  it('pulls a note played a hair early onto beat 0', () => {
    const notes = recordedToNotes(
      [{ midiPitch: 60, startMs: -10, durationMs: 500, velocity: 80 }],
      at120,
    )

    expect(notes[0].startBeat).toBe(0)
  })
})

describe('addNotes', () => {
  const recorded = [
    { midiPitch: 64, startBeat: 1, durationBeats: 1, velocity: 100 },
    { midiPitch: 60, startBeat: 0, durationBeats: 1, velocity: 40 },
    { midiPitch: 20, startBeat: 2, durationBeats: 1, velocity: 40 },
  ]

  it('adds every in-range note in onset order and drops the rest', () => {
    const chart = addNotes(at120, PART, recorded)

    expect(chart.parts[0].notes).toEqual([
      { index: 0, midiPitch: 60, startBeat: 0, durationBeats: 1, velocity: 40 },
      { index: 1, midiPitch: 64, startBeat: 1, durationBeats: 1, velocity: 100 },
    ])
  })

  it('keeps or replaces what was there', () => {
    const existing = addNotes(at120, PART, [{ midiPitch: 72, startBeat: 8, durationBeats: 1 }])

    expect(addNotes(existing, PART, recorded).parts[0].notes).toHaveLength(3)
    expect(addNotes(existing, PART, recorded, { replace: true }).parts[0].notes).toHaveLength(2)
  })
})

describe('setVelocity', () => {
  const chart = addNotes(at120, PART, [
    { midiPitch: 60, startBeat: 0, durationBeats: 1.5, velocity: 80 },
  ])

  it('changes the dynamics without moving or resizing the note', () => {
    expect(setVelocity(chart, PART, 0, 30).parts[0].notes[0]).toEqual({
      index: 0,
      midiPitch: 60,
      startBeat: 0,
      durationBeats: 1.5,
      velocity: 30,
    })
  })

  it('clamps to the MIDI range and ignores a missing note', () => {
    expect(setVelocity(chart, PART, 0, 500).parts[0].notes[0].velocity).toBe(127)
    expect(setVelocity(chart, PART, 0, 0).parts[0].notes[0].velocity).toBe(1)
    expect(setVelocity(chart, PART, 5, 30)).toBe(chart)
  })
})
