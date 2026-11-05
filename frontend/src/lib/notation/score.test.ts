import { describe, expect, it } from 'vitest'

import { addNotes } from '@/lib/chart/edits'
import type { NoteInput } from '@/lib/chart/edits'
import { buildScore, splitDuration } from '@/lib/notation/score'
import { emptyChart } from '@/lib/schema/collections'

function chartOf(notes: NoteInput[], { keySignature = 0, timeSigNum = 4, timeSigDen = 4 } = {}) {
  const chart = {
    ...emptyChart('piano'),
    keySignature,
    tempoMap: [{ atBeat: 0, bpm: 120, timeSigNum, timeSigDen }],
  }
  return addNotes(chart, 'lead', notes)
}

const note = (midiPitch: number, startBeat: number, durationBeats: number) => ({
  midiPitch,
  startBeat,
  durationBeats,
})

/** "quarter", "eighth." and so on for a measure's events, rests marked with r. */
function rhythm(score: ReturnType<typeof buildScore>, measure: number) {
  return score.measures[measure].events.map(
    (event) => `${event.kind === 'rest' ? 'r' : ''}${event.type}${event.dotted ? '.' : ''}`,
  )
}

describe('splitDuration', () => {
  it('writes a duration starting on the beat as one note when it can', () => {
    expect(splitDuration(0, 48, 16).map((piece) => [piece.type, piece.dotted])).toEqual([
      ['half', true],
    ])
  })

  it('stops an off-beat note at the next beat', () => {
    // An eighth into beat 1, held for a half note's worth.
    expect(splitDuration(8, 40, 16).map((piece) => [piece.type, piece.dotted])).toEqual([
      ['eighth', false],
      ['quarter', true],
    ])
  })

  it('groups in dotted quarters in compound time', () => {
    expect(splitDuration(0, 24, 24).map((piece) => [piece.type, piece.dotted])).toEqual([
      ['quarter', true],
    ])
  })
})

describe('buildScore', () => {
  it('fills an empty chart with whole-bar rests', () => {
    const score = buildScore(emptyChart('piano'), 'lead')
    expect(score.measures).toHaveLength(4)
    expect(score.measures.every((measure) => measure.events[0].wholeBar)).toBe(true)
  })

  it('fills gaps with rests and pads the bar', () => {
    const score = buildScore(chartOf([note(60, 1, 1), note(62, 2.5, 0.5)]), 'lead')
    expect(rhythm(score, 0)).toEqual(['rquarter', 'quarter', 'reighth', 'eighth', 'rquarter'])
  })

  it('ties a note across the bar line', () => {
    const score = buildScore(chartOf([note(67, 3, 2)]), 'lead')
    const last = score.measures[0].events.at(-1)!
    const first = score.measures[1].events[0]
    expect(last.notes[0]).toMatchObject({ tieStart: true, tieEnd: false })
    expect(first.notes[0]).toMatchObject({ tieStart: false, tieEnd: true })
    expect(first.type).toBe('quarter')
  })

  it('groups notes with the same onset into one chord', () => {
    const score = buildScore(chartOf([note(64, 0, 1), note(60, 0, 1), note(67, 0, 1)]), 'lead')
    const chord = score.measures[0].events[0]
    expect(chord.notes.map((staffNote) => staffNote.midiPitch)).toEqual([60, 64, 67])
  })

  it('cuts off a note still sounding when the next one starts', () => {
    const score = buildScore(chartOf([note(60, 0, 4), note(62, 1, 1)]), 'lead')
    expect(rhythm(score, 0).slice(0, 2)).toEqual(['quarter', 'quarter'])
  })

  it('prints accidentals against the key and the bar, not the same one twice', () => {
    // D major: F# and C# are in the key, F natural is not.
    const score = buildScore(
      chartOf([note(66, 0, 1), note(65, 1, 1), note(65, 2, 1), note(66, 3, 1)], {
        keySignature: 2,
      }),
      'lead',
    )
    const accidentals = score.measures[0].events.map((event) => event.notes[0].accidental)
    expect(accidentals).toEqual([null, 'natural', null, 'sharp'])
  })

  it('starts each bar from the key signature again', () => {
    const score = buildScore(chartOf([note(61, 0, 1), note(61, 4, 1)]), 'lead')
    expect(score.measures[1].events[0].notes[0].accidental).toBe('sharp')
  })

  it('beams eighths within a beat, and a rest breaks the beam', () => {
    const score = buildScore(
      chartOf([note(60, 0, 0.5), note(62, 0.5, 0.5), note(64, 1, 0.5), note(65, 2.5, 0.5)]),
      'lead',
    )
    const beams = score.measures[0].events.map((event) => event.beam)
    expect(beams[0]).not.toBeNull()
    expect(beams[1]).toBe(beams[0])
    // Beat two holds one eighth then a rest; beat three a rest then one eighth.
    expect(beams.slice(2)).toEqual([null, null, null, null, null])
  })

  it('splits by the compound beat in 6/8', () => {
    const score = buildScore(chartOf([note(60, 0, 3)], { timeSigNum: 6, timeSigDen: 8 }), 'lead')
    expect(score.barTicks).toBe(48)
    expect(rhythm(score, 0)).toEqual(['half.'])
  })

  it('rounds free timing onto the 64th-note grid without losing a note', () => {
    const score = buildScore(chartOf([note(60, 0, 1 / 3), note(62, 1 / 3, 1 / 3)]), 'lead')
    const chords = score.measures[0].events.filter((event) => event.kind === 'chord')
    expect(chords.flatMap((event) => event.notes.map((staffNote) => staffNote.midiPitch))).toEqual(
      expect.arrayContaining([60, 62]),
    )
  })
})
