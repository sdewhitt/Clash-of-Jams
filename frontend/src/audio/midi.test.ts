import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'

import { performanceFromMidi } from '@/scoring/midi'
import type { PerformedNote } from '@/scoring/score'

import type { ExpectedNote } from '@/lib/schema/types'

import { answerKeyFromMidi, answerKeyToMidi, performanceToMidi } from './midi'

const notes: PerformedNote[] = [
  { midiPitch: 60, startMs: 0, durationMs: 400, velocity: 100 },
  { midiPitch: 64.2, startMs: 500, durationMs: 400, velocity: 64 },
  { midiPitch: 66.9, startMs: 1003, durationMs: 250, velocity: 20 },
]

describe('performanceToMidi', () => {
  it('round-trips through the scoring engine’s MIDI reader', () => {
    const read = performanceFromMidi(performanceToMidi(notes))
    expect(read.map((n) => n.midiPitch)).toEqual([60, 64, 67])
    read.forEach((n, i) => {
      expect(Math.abs(n.startMs - notes[i].startMs)).toBeLessThan(2)
      expect(Math.abs(n.durationMs - notes[i].durationMs)).toBeLessThan(2)
      expect(Math.abs(n.velocity - notes[i].velocity)).toBeLessThanOrEqual(1)
    })
  })

  it('keeps cents as pitch bends', () => {
    const [track] = new Midi(performanceToMidi(notes)).tracks
    expect(track.pitchBends.map((b) => Math.round(b.value * 200))).toEqual([0, 20, -10])
  })

  it('writes a transcription that answerKeyFromMidi reads as beats', () => {
    const { expected } = answerKeyFromMidi(performanceToMidi(notes, 120))
    expect(expected.map((n) => n.startBeat)).toEqual([0, 1, expect.closeTo(2.006, 2)])
  })

  it('clips a note that starts before time 0', () => {
    const read = performanceFromMidi(
      performanceToMidi([{ midiPitch: 60, startMs: -30, durationMs: 400, velocity: 100 }]),
    )
    expect(read).toHaveLength(1)
    expect(read[0].startMs).toBeCloseTo(0, 0)
    expect(Math.abs(read[0].durationMs - 370)).toBeLessThan(2)
  })
})

describe('answerKeyFromMidi', () => {
  const key: ExpectedNote[] = [
    { index: 0, midiPitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
    { index: 1, midiPitch: 64, startBeat: 1, durationBeats: 0.5, velocity: 80 },
    { index: 2, midiPitch: 67, startBeat: 2.5, durationBeats: 1.5, velocity: 60 },
  ]

  it('round-trips an answer key written by answerKeyToMidi', () => {
    const { expected, tempoMap } = answerKeyFromMidi(answerKeyToMidi(key, 90))
    expect(tempoMap).toHaveLength(1)
    expect(tempoMap[0]).toMatchObject({ atBeat: 0, timeSigNum: 4, timeSigDen: 4 })
    expect(tempoMap[0].bpm).toBeCloseTo(90, 3)
    expect(
      expected.map(({ midiPitch, startBeat, durationBeats }) => [
        midiPitch,
        startBeat,
        durationBeats,
      ]),
    ).toEqual(
      key.map(({ midiPitch, startBeat, durationBeats }) => [midiPitch, startBeat, durationBeats]),
    )
    expect(expected.map((n) => Math.abs(n.velocity - key[n.index].velocity) <= 1)).toEqual([
      true,
      true,
      true,
    ])
  })

  it('follows tempo and time-signature changes', () => {
    const midi = new Midi()
    const ppq = midi.header.ppq
    midi.header.tempos.push({ ticks: 0, bpm: 100 }, { ticks: 8 * ppq, bpm: 140 })
    midi.header.timeSignatures.push(
      { ticks: 0, timeSignature: [4, 4] },
      { ticks: 4 * ppq, timeSignature: [3, 4] },
    )
    midi.header.update()
    midi.addTrack().addNote({ midi: 62, ticks: 9 * ppq, durationTicks: ppq })

    const { expected, tempoMap } = answerKeyFromMidi(midi.toArray())
    expect(tempoMap.map(({ atBeat, timeSigNum }) => [atBeat, timeSigNum])).toEqual([
      [0, 4],
      [4, 3],
      [8, 3],
    ])
    expect(tempoMap.map((t) => Math.round(t.bpm))).toEqual([100, 100, 140])
    expect(expected).toEqual([
      { index: 0, midiPitch: 62, startBeat: 9, durationBeats: 1, velocity: 127 },
    ])
  })

  it('merges every track into one answer key, in time order', () => {
    const midi = new Midi()
    midi.addTrack().addNote({ midi: 67, time: 1, duration: 0.5 })
    midi.addTrack().addNote({ midi: 60, time: 0, duration: 0.5 })
    const { expected } = answerKeyFromMidi(midi.toArray())
    expect(expected.map((n) => [n.index, n.midiPitch])).toEqual([
      [0, 60],
      [1, 67],
    ])
  })

  it('rejects a file with no notes', () => {
    expect(() => answerKeyFromMidi(new Midi().toArray())).toThrow('no notes')
  })
})
