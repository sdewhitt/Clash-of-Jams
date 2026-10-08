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
    expect(finalScore).toBe(100_000)
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
    expect(finalScore).toBe(53_333)
    expect(breakdown.noteResults).toEqual([
      { expectedNoteIndex: 0, verdict: 'hit', timingDeltaMs: 20, centsDeviation: 0 },
      { expectedNoteIndex: 1, verdict: 'wrong_pitch', timingDeltaMs: 0, centsDeviation: 100 },
      { expectedNoteIndex: 2, verdict: 'missed', timingDeltaMs: 0, centsDeviation: 0 },
    ])
    expect(breakdown.notesHit).toBe(1)
    expect(breakdown.notesMissed).toBe(1)
  })

  it('gives partial rhythm credit between one and two hit windows', () => {
    // The default hit window is 120 ms.
    const { breakdown } = score([played(60, 180), played(64, 350), played(67, 1000)])
    expect(breakdown.noteResults.map((r) => r.verdict)).toEqual(['late', 'early', 'hit'])
    // 180 ms late earns 0.5; 150 ms early earns 0.75.
    expect(breakdown.rhythmAccuracy).toBe(75)
    expect(breakdown.pitchAccuracy).toBe(100)
  })

  it('reads the hit window from the rules', () => {
    const lateBy100 = [played(60, 100), played(64, 500), played(67, 1000)]
    expect(score(lateBy100, { hitWindowMs: 150 }).breakdown.noteResults[0].verdict).toBe('hit')
    expect(score(lateBy100, { hitWindowMs: 80 }).breakdown.noteResults[0].verdict).toBe('late')
  })

  it('reads pitch tolerance from the rules', () => {
    const { finalScore, breakdown } = score([played(60, 20), played(65, 500)], {
      pitchToleranceCents: 150,
    })
    expect(breakdown.pitchAccuracy).toBe(66.67)
    expect(finalScore).toBe(66_667)
  })

  it('scores fractional pitch against the cents tolerance', () => {
    // The default tolerance is 50 cents.
    const { breakdown } = score([played(60.15, 0), played(64.6, 500), played(67, 1000)])
    expect(breakdown.noteResults.map((r) => r.verdict)).toEqual(['hit', 'wrong_pitch', 'hit'])
    expect(breakdown.noteResults[0].centsDeviation).toBe(15)
    expect(breakdown.noteResults[1].centsDeviation).toBe(60)
  })

  it('counts extra notes without penalizing completeness', () => {
    const { finalScore, breakdown } = score([...exact, played(62, 250)])
    expect(breakdown.extraNotes).toBe(1)
    expect(breakdown.completeness).toBe(100)
    expect(finalScore).toBe(100_000)
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
    expect(result.finalScore).toBe(100_000)
  })

  it('fills unset rules from the defaults', () => {
    // A 10 ms window makes a 15 ms error late; tolerance and weights stay default.
    const { finalScore, breakdown } = score([played(60, 15), played(64, 500), played(67, 1000)], {
      hitWindowMs: 10,
    })
    expect(breakdown.noteResults[0].verdict).toBe('late')
    expect(breakdown.rhythmAccuracy).toBe(83.33)
    expect(finalScore).toBe(93_333)
  })

  it('follows the scenario weights', () => {
    // Pitch 33.33, rhythm 66.67, completeness 66.67.
    const performed = [played(60, 20), played(65, 500)]
    expect(
      score(performed, { pitchWeight: 1, rhythmWeight: 0, completenessWeight: 0 }).finalScore,
    ).toBe(33_333)
    expect(
      score(performed, { pitchWeight: 0, rhythmWeight: 1, completenessWeight: 0 }).finalScore,
    ).toBe(66_667)
    expect(
      score(performed, { pitchWeight: 1, rhythmWeight: 1, completenessWeight: 2 }).finalScore,
    ).toBe(58_333)
  })

  it('rejects a scenario with no notes', () => {
    expect(() => scorePerformance({ expected: [], tempoMap, performed: exact })).toThrow()
  })

  it('stretches expected timing by the speed multiplier', () => {
    const slow = exact.map((note) => ({ ...note, startMs: note.startMs * 2 }))
    const result = scorePerformance({ expected, tempoMap, performed: slow, speedMultiplier: 0.5 })
    expect(result.finalScore).toBe(100_000)
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
    expect(scorePerformance({ expected, tempoMap, performed }).finalScore).toBe(100_000)
  })
})
