import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'

import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'

import { performanceFromMidi } from './midi'
import { beatToMs, scorePerformance, type PerformedNote } from './score'

const tempoMap: TempoMapEntry[] = [{ atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 }]

// C4, E4, G4 as quarter notes at 120 bpm: onsets at 0, 500 and 1000 ms.
const expected: ExpectedNote[] = [60, 64, 67].map((midiPitch, i) => ({
  index: i,
  midiPitch,
  startBeat: i,
  durationBeats: 1,
  velocity: 100,
}))

const played = (midiPitch: number, startMs: number): PerformedNote => ({
  midiPitch,
  startMs,
  durationMs: 400,
  velocity: 100,
})

const exact = [played(60, 0), played(64, 500), played(67, 1000)]

function score(performed: PerformedNote[], rules = {}) {
  const first = scorePerformance({ expected, tempoMap, performed, rules })
  expect(scorePerformance({ expected, tempoMap, performed, rules })).toEqual(first)
  return first
}

describe('scorePerformance', () => {
  it('gives 100 for an exact performance', () => {
    const { finalScore, breakdown } = score(exact)
    expect(finalScore).toBe(100)
    expect(breakdown.pitchAccuracy).toBe(100)
    expect(breakdown.rhythmAccuracy).toBe(100)
    expect(breakdown.completeness).toBe(100)
    expect(breakdown.noteResults.map((r) => r.verdict)).toEqual(['hit', 'hit', 'hit'])
  })

  it('separates pitch, rhythm and completeness', () => {
    const { finalScore, breakdown } = score([played(60, 20), played(65, 500)])
    expect(breakdown.pitchAccuracy).toBe(33.33)
    expect(breakdown.rhythmAccuracy).toBe(66.67)
    expect(breakdown.completeness).toBe(66.67)
    expect(finalScore).toBe(53.33)
    expect(breakdown.noteResults).toEqual([
      { expectedNoteIndex: 0, verdict: 'hit', timingDeltaMs: 20, centsDeviation: 0 },
      { expectedNoteIndex: 1, verdict: 'wrong_pitch', timingDeltaMs: 0, centsDeviation: 100 },
      { expectedNoteIndex: 2, verdict: 'missed', timingDeltaMs: 0, centsDeviation: 0 },
    ])
    expect(breakdown.notesHit).toBe(1)
    expect(breakdown.notesMissed).toBe(1)
  })

  it('gives partial rhythm credit between one and two hit windows', () => {
    // At 120 bpm the default quarter-of-a-beat window is 125 ms.
    const { breakdown } = score([played(60, 187.5), played(64, 343.75), played(67, 1000)])
    expect(breakdown.noteResults.map((r) => r.verdict)).toEqual(['late', 'early', 'hit'])
    // 187.5 ms late earns 0.5; 156.25 ms early earns 0.75.
    expect(breakdown.rhythmAccuracy).toBe(75)
    expect(breakdown.pitchAccuracy).toBe(100)
  })

  it('scales the hit window with tempo', () => {
    const oneNote: ExpectedNote[] = [
      { index: 0, midiPitch: 60, startBeat: 1, durationBeats: 1, velocity: 100 },
    ]
    const at = (bpm: number, startMs: number) =>
      scorePerformance({
        expected: oneNote,
        tempoMap: [{ atBeat: 0, bpm, timeSigNum: 4, timeSigDen: 4 }],
        performed: [played(60, startMs)],
      }).breakdown.noteResults[0].verdict
    // The same 100 ms late error: inside a 250 ms window at 60 bpm, outside 62.5 ms at 240 bpm.
    expect(at(60, 1000 + 100)).toBe('hit')
    expect(at(240, 250 + 100)).toBe('late')
  })

  it('reads pitch tolerance from the rules', () => {
    const { finalScore, breakdown } = score([played(60, 20), played(65, 500)], {
      pitchToleranceCents: 150,
    })
    expect(breakdown.pitchAccuracy).toBe(66.67)
    expect(finalScore).toBe(66.67)
  })

  it('scores fractional pitch against the cents tolerance', () => {
    const { breakdown } = score([played(60.15, 0), played(64.3, 500), played(67, 1000)])
    expect(breakdown.noteResults.map((r) => r.verdict)).toEqual(['hit', 'wrong_pitch', 'hit'])
    expect(breakdown.noteResults[0].centsDeviation).toBe(15)
    expect(breakdown.noteResults[1].centsDeviation).toBe(30)
  })

  it('counts extra notes without penalizing completeness', () => {
    const { finalScore, breakdown } = score([...exact, played(62, 250)])
    expect(breakdown.extraNotes).toBe(1)
    expect(breakdown.completeness).toBe(100)
    expect(finalScore).toBe(100)
  })

  it('scores an empty performance as zero', () => {
    const { finalScore, breakdown } = score([])
    expect(finalScore).toBe(0)
    expect(breakdown.notesMissed).toBe(3)
    expect(breakdown.noteResults.every((r) => r.verdict === 'missed')).toBe(true)
  })

  it('ignores the order of performed notes', () => {
    expect(score([exact[2], exact[0], exact[1]])).toEqual(score(exact))
  })

  it('matches chord notes by pitch', () => {
    const chord: ExpectedNote[] = [
      { index: 0, midiPitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
      { index: 1, midiPitch: 64, startBeat: 0, durationBeats: 1, velocity: 100 },
    ]
    const result = scorePerformance({
      expected: chord,
      tempoMap,
      performed: [played(64, 5), played(60, 10)],
    })
    expect(result.finalScore).toBe(100)
  })

  it('fills unset rules from the defaults', () => {
    // 0.02 beats is 10 ms at 120 bpm, so a 15 ms error is late; tolerance and weights stay default.
    const { finalScore, breakdown } = score([played(60, 15), played(64, 500), played(67, 1000)], {
      hitWindowBeats: 0.02,
    })
    expect(breakdown.noteResults[0].verdict).toBe('late')
    expect(breakdown.rhythmAccuracy).toBe(83.33)
    expect(finalScore).toBe(93.33)
  })

  it('rejects a scenario with no notes', () => {
    expect(() => scorePerformance({ expected: [], tempoMap, performed: exact })).toThrow()
  })

  it('stretches expected timing by the speed multiplier', () => {
    const slow = exact.map((note) => ({ ...note, startMs: note.startMs * 2 }))
    const result = scorePerformance({ expected, tempoMap, performed: slow, speedMultiplier: 0.5 })
    expect(result.finalScore).toBe(100)
  })
})

describe('beatToMs', () => {
  it('follows tempo changes', () => {
    const map: TempoMapEntry[] = [
      { atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 },
      { atBeat: 2, bpm: 60, timeSigNum: 4, timeSigDen: 4 },
    ]
    expect(beatToMs(1, map)).toBe(500)
    expect(beatToMs(3, map)).toBe(2000)
  })
})

describe('performanceFromMidi', () => {
  it('scores a MIDI file', () => {
    const midi = new Midi()
    midi.header.setTempo(120)
    const track = midi.addTrack()
    for (const note of exact) {
      track.addNote({ midi: note.midiPitch, time: note.startMs / 1000, duration: 0.4 })
    }

    const performed = performanceFromMidi(midi.toArray())
    expect(performed.map((n) => n.midiPitch)).toEqual([60, 64, 67])
    expect(scorePerformance({ expected, tempoMap, performed }).finalScore).toBe(100)
  })
})
