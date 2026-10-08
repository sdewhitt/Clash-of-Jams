import { describe, expect, it } from 'vitest'

import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'

import { explainScore } from './explain'
import { scorePerformance, type PerformedNote } from './score'

const tempoMap: TempoMapEntry[] = [{ atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 }]

// C4 D4 E4 F4 G4 as quarter notes at 120 bpm: onsets every 500 ms.
const expected: ExpectedNote[] = [60, 62, 64, 65, 67].map((midiPitch, i) => ({
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

const perfect = expected.map((note) => played(note.midiPitch, note.startBeat * 500))

function explain(performed: PerformedNote[]) {
  const result = scorePerformance({ expected, tempoMap, performed })
  return explainScore({ result, expected })
}

describe('explainScore', () => {
  it('praises a perfect performance and lists no problems', () => {
    const explanation = explain(perfect)
    expect(explanation.summary).toBe('Excellent! A perfect performance.')
    expect(explanation.noteProblems).toEqual([])
    expect(explanation.categories.map((c) => c.detail)).toEqual([
      '5 of 5 notes were in tune (within 50 cents).',
      '5 of 5 notes were on time (within 120 ms).',
      'You played 5 of 5 notes.',
    ])
  })

  it('shows each category with its weight', () => {
    const explanation = explain(perfect)
    expect(explanation.categories.map((c) => [c.label, c.weightPercent])).toEqual([
      ['Pitch', 40],
      ['Rhythm', 40],
      ['Completeness', 20],
    ])
  })

  it('explains wrong pitches with correct rhythm', () => {
    const performed = [...perfect]
    performed[1] = played(63, 500)
    performed[3] = played(64, 1500)
    const explanation = explain(performed)
    expect(explanation.noteProblems).toEqual([
      'Note 2 (D4) was 100 cents sharp (too high).',
      'Note 4 (F4) was 100 cents flat (too low).',
    ])
    expect(explanation.categories[0].detail).toBe('3 of 5 notes were in tune (within 50 cents).')
    expect(explanation.categories[1].score).toBe(100)
    expect(explanation.summary).toContain('Focus on pitch')
  })

  it('explains early and late notes with correct pitch', () => {
    const performed = [...perfect]
    performed[0] = played(60, -150)
    performed[2] = played(64, 1000 + 200)
    const explanation = explain(performed)
    expect(explanation.noteProblems).toEqual([
      'Note 1 (C4) was 150 ms early.',
      'Note 3 (E4) was 200 ms late.',
    ])
    expect(explanation.categories[1].detail).toBe('3 of 5 notes were on time (within 120 ms).')
    expect(explanation.summary).toContain('Focus on rhythm')
  })

  it('explains missing and extra notes', () => {
    const performed = [...perfect.slice(0, 4), played(72, 250)]
    const explanation = explain(performed)
    expect(explanation.noteProblems).toEqual(['Note 5 (G4) was missed.'])
    expect(explanation.categories[2].detail).toBe(
      'You played 4 of 5 notes. You also played 1 extra note.',
    )
  })

  it('gives the same explanation for the same performance', () => {
    const performed = [played(60, 30), played(63, 520), played(64, 1100)]
    expect(explain(performed)).toEqual(explain(performed))
  })
})
