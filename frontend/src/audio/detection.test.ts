import { describe, expect, it } from 'vitest'

import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'
import { scorePerformance } from '@/scoring/score'

import { FrameAnalyzer, hzToMidi } from './analysis'
import { toPerformedNotes } from './performance'
import { NoteSegmenter, type DetectedNote } from './segmenter'

const SR = 44100
const BLOCK = 128

/** A tone (hz) or silence (null). Adjacent tones are joined without a gap. */
interface Segment {
  hz: number | null
  seconds: number
  amp?: number
}

const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** Deterministic PRNG so noise and random sequences are identical on every run. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Renders segments with continuous phase, 5 ms fade-ins and 10 ms fade-outs around silence. */
function synth(
  segments: Segment[],
  {
    harmonics = [1],
    noiseAmp = 0,
    seed = 1,
  }: { harmonics?: number[]; noiseAmp?: number; seed?: number } = {},
): Float32Array {
  const total = Math.round(segments.reduce((s, seg) => s + seg.seconds, 0) * SR)
  const out = new Float32Array(total)
  const rand = mulberry32(seed)
  const norm = harmonics.reduce((a, b) => a + b, 0)
  const fadeIn = 0.005 * SR
  const fadeOut = 0.01 * SR
  let phase = 0
  let pos = 0
  segments.forEach((seg, k) => {
    const n = Math.round(seg.seconds * SR)
    const afterSilence = segments[k - 1]?.hz == null
    const beforeSilence = segments[k + 1]?.hz == null
    for (let i = 0; i < n && pos < total; i++, pos++) {
      let sample = 0
      if (seg.hz !== null) {
        phase += (2 * Math.PI * seg.hz) / SR
        let env = 1
        if (afterSilence) env = Math.min(env, i / fadeIn)
        if (beforeSilence) env = Math.min(env, (n - i) / fadeOut)
        for (let h = 0; h < harmonics.length; h++) {
          sample += harmonics[h] * Math.sin((h + 1) * phase)
        }
        sample *= ((seg.amp ?? 0.5) * env) / norm
      }
      out[pos] = sample + noiseAmp * (rand() * 2 - 1)
    }
  })
  return out
}

/** Start time and pitch of every tone segment. */
function onsets(segments: Segment[]): { time: number; midi: number }[] {
  const out: { time: number; midi: number }[] = []
  let t = 0
  for (const seg of segments) {
    if (seg.hz !== null) out.push({ time: t, midi: hzToMidi(seg.hz) })
    t += seg.seconds
  }
  return out
}

/** Runs samples through the analyzer and segmenter in AudioWorklet-sized blocks. */
function detect(samples: Float32Array, startTime = 0): DetectedNote[] {
  const analyzer = new FrameAnalyzer(SR)
  const segmenter = new NoteSegmenter({ pitchLagMs: analyzer.pitchLagMs })
  const notes: DetectedNote[] = []
  for (let i = 0; i < samples.length; i += BLOCK) {
    const block = samples.subarray(i, i + BLOCK)
    for (const frame of analyzer.push(block, startTime + i / SR)) {
      notes.push(...segmenter.push(frame))
    }
  }
  notes.push(...segmenter.flush())
  return notes
}

const silence = (seconds: number): Segment => ({ hz: null, seconds })
const tone = (midi: number, seconds: number, amp?: number): Segment => ({
  hz: midiToHz(midi),
  seconds,
  amp,
})

describe('single pitches', () => {
  it.each([
    ['E2 (guitar low E)', 40],
    ['A2', 45],
    ['C4 (middle C)', 60],
    ['A4', 69],
    ['C6', 84],
  ])('identifies %s', (_, midi) => {
    const notes = detect(synth([silence(0.2), tone(midi, 0.5), silence(0.3)]))
    expect(notes).toHaveLength(1)
    expect(notes[0].midiPitch).toBeCloseTo(midi, 1)
  })

  it('keeps cents in the fractional pitch', () => {
    const notes = detect(synth([silence(0.2), tone(69.25, 0.5), silence(0.3)]))
    expect(notes).toHaveLength(1)
    expect(Math.abs(notes[0].midiPitch - 69.25)).toBeLessThan(0.05)
  })

  it('identifies a pitch with harmonics, not its overtones', () => {
    const notes = detect(
      synth([silence(0.2), tone(57, 0.5), silence(0.3)], { harmonics: [1, 0.6, 0.4, 0.3] }),
    )
    expect(notes).toHaveLength(1)
    expect(Math.round(notes[0].midiPitch)).toBe(57)
  })
})

describe('onset timing', () => {
  const segments = [
    silence(0.3),
    tone(60, 0.25),
    silence(0.25),
    tone(64, 0.25),
    silence(0.1),
    tone(67, 0.15),
    silence(0.35),
    tone(72, 0.4),
    silence(0.3),
  ]

  it('places every onset within 20 ms and every duration within 40 ms', () => {
    const notes = detect(synth(segments))
    const expected = onsets(segments)
    const durations = segments.filter((s) => s.hz !== null).map((s) => s.seconds)
    expect(notes).toHaveLength(expected.length)
    notes.forEach((note, i) => {
      expect(Math.abs(note.startTime - expected[i].time)).toBeLessThan(0.02)
      expect(Math.abs(note.durationSeconds - durations[i])).toBeLessThan(0.04)
    })
  })

  it('reports onsets on the clock it was given', () => {
    const notes = detect(synth(segments), 12.5)
    expect(Math.abs(notes[0].startTime - 12.8)).toBeLessThan(0.02)
  })
})

describe('slow sequences', () => {
  const scale = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]

  it('keeps separated notes in order', () => {
    const segments = [silence(0.3), ...scale.flatMap((m) => [tone(m, 0.6), silence(0.4)])]
    const notes = detect(synth(segments))
    expect(notes.map((n) => Math.round(n.midiPitch))).toEqual(scale)
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i].startTime).toBeGreaterThan(notes[i - 1].startTime)
    }
  })

  it('splits legato notes on pitch changes', () => {
    const segments = [silence(0.3), ...scale.map((m) => tone(m, 0.6)), silence(0.3)]
    const notes = detect(synth(segments))
    expect(notes.map((n) => Math.round(n.midiPitch))).toEqual(scale)
    notes.forEach((note, i) => {
      expect(Math.abs(note.startTime - (0.3 + i * 0.6))).toBeLessThan(0.05)
    })
  })
})

describe('silence and noise', () => {
  it('detects nothing in digital silence', () => {
    expect(detect(new Float32Array(SR * 2))).toEqual([])
  })

  it('detects nothing in white noise', () => {
    expect(detect(synth([silence(3)], { noiseAmp: 0.1 }))).toEqual([])
  })

  it('detects nothing in low room noise', () => {
    expect(detect(synth([silence(3)], { noiseAmp: 0.002 }))).toEqual([])
  })

  it('ignores a tone below the gate', () => {
    expect(detect(synth([silence(0.3), tone(69, 0.5, 0.0005), silence(0.3)]))).toEqual([])
  })

  it('ignores a click shorter than a note', () => {
    expect(detect(synth([silence(0.3), tone(69, 0.03), silence(0.3)]))).toEqual([])
  })

  it('still finds a note played over noise', () => {
    const notes = detect(synth([silence(1), tone(64, 0.5), silence(0.5)], { noiseAmp: 0.005 }))
    expect(notes).toHaveLength(1)
    expect(Math.round(notes[0].midiPitch)).toBe(64)
  })
})

describe('acceptance', () => {
  it('identifies at least 95 of 100 monophonic notes within 1 semitone', () => {
    const rand = mulberry32(65)
    const segments: Segment[] = [silence(0.5)]
    for (let i = 0; i < 100; i++) {
      const midi = 40 + Math.floor(rand() * 45)
      segments.push(tone(midi, 0.2 + rand() * 0.3, 0.2 + rand() * 0.6))
      segments.push(silence(0.08 + rand() * 0.12))
    }
    const notes = detect(
      synth(segments, { harmonics: [1, 0.5, 0.3, 0.2], noiseAmp: 0.001, seed: 80 }),
    )

    const identified = onsets(segments).filter(({ time, midi }) =>
      notes.some((n) => Math.abs(n.startTime - time) < 0.05 && Math.abs(n.midiPitch - midi) <= 1),
    ).length
    expect(identified).toBeGreaterThanOrEqual(95)
  })

  it('passes detected notes to the scoring engine', () => {
    // A one-second count-in, then C4 E4 G4 on beats 0-2 at 120 bpm.
    const segments = [
      silence(0.4),
      tone(55, 0.3),
      silence(0.3),
      tone(60, 0.4),
      silence(0.1),
      tone(64, 0.4),
      silence(0.1),
      tone(67, 0.4),
      silence(0.3),
    ]
    const tempoMap: TempoMapEntry[] = [{ atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 }]
    const expected: ExpectedNote[] = [60, 64, 67].map((midiPitch, i) => ({
      index: i,
      midiPitch,
      startBeat: i,
      durationBeats: 1,
      velocity: 100,
    }))

    const performed = toPerformedNotes(detect(synth(segments)), 1.0)
    const { finalScore, breakdown } = scorePerformance({ expected, tempoMap, performed })

    expect(performed).toHaveLength(3)
    expect(breakdown.extraNotes).toBe(0)
    expect(breakdown.noteResults.map((r) => r.verdict)).toEqual(['hit', 'hit', 'hit'])
    expect(finalScore).toBe(100)
  })

  it('subtracts input latency before scoring', () => {
    const notes = detect(synth([silence(0.53), tone(60, 0.4), silence(0.3)]))
    const [performed] = toPerformedNotes(notes, 0.5, 30)
    expect(Math.abs(performed.startMs)).toBeLessThan(20)
  })
})
