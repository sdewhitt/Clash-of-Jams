import type { ExpectedNote } from '@/lib/schema/types'
import { beatToMs, scorePerformance, type PerformedNote, type ScoreResult } from '@/scoring/score'

import type { AnswerKey } from './midi'
import { toPerformedNotes } from './performance'
import type { DetectedNote } from './segmenter'

/** A synthetic take with a known answer key, for evaluating transcription end to end. */
export interface TestRecording {
  id: string
  title: string
  description: string
  bpm: number
  /** Seconds before beat 0; scenario time starts here. */
  leadInSeconds: number
  /** Share of each notated duration that sounds; 1 is legato. */
  articulation: number
  /** Peak vibrato depth, in cents. */
  vibratoCents: number
  /** Largest random detune per note, in cents, standing in for imperfect intonation. */
  detuneCents: number
  /** Background noise RMS, in dBFS, or null for digital silence. */
  noiseDb: number | null
  /** Non-note sounds that must not be detected. */
  distractions?: { atSeconds: number; kind: 'click' | 'noise'; seconds: number; db: number }[]
  seconds: number
  seed: number
  notes: ExpectedNote[]
}

export const RECORDING_SAMPLE_RATE = 44100

/** Deterministic PRNG, so every render of a recording is identical. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sequence(pitches: number[], beats: number[] | number, velocity = 96): ExpectedNote[] {
  let beat = 0
  return pitches.map((midiPitch, index) => {
    const durationBeats = Array.isArray(beats) ? beats[index] : beats
    const note = { index, midiPitch, startBeat: beat, durationBeats, velocity }
    beat += durationBeats
    return note
  })
}

function lengthOf(notes: ExpectedNote[], bpm: number, leadInSeconds: number): number {
  const last = notes.at(-1)
  const beats = last ? last.startBeat + last.durationBeats : 0
  return leadInSeconds + (beats * 60) / bpm + 1
}

function recording(r: Omit<TestRecording, 'seconds'> & { seconds?: number }): TestRecording {
  return { ...r, seconds: r.seconds ?? lengthOf(r.notes, r.bpm, r.leadInSeconds) }
}

function randomMelody(count: number, seed: number): ExpectedNote[] {
  const rand = mulberry32(seed)
  const durations = [0.5, 1, 1, 1, 1.5, 2]
  const pitches: number[] = []
  const beats: number[] = []
  for (let i = 0; i < count; i++) {
    pitches.push(40 + Math.floor(rand() * 37))
    beats.push(durations[Math.floor(rand() * durations.length)])
  }
  return sequence(pitches, beats).map((note) => ({
    ...note,
    velocity: 40 + Math.floor(rand() * 80),
  }))
}

const C_MAJOR = [60, 62, 64, 65, 67, 69, 71, 72]

export const TEST_RECORDINGS: TestRecording[] = [
  recording({
    id: 'single-pitches',
    title: 'Single pitches',
    description: 'Ten isolated notes from guitar low E (E2) to C6.',
    bpm: 60,
    leadInSeconds: 1,
    articulation: 0.6,
    vibratoCents: 0,
    detuneCents: 0,
    noiseDb: -70,
    seed: 1,
    notes: sequence([40, 45, 50, 55, 59, 64, 69, 74, 79, 84], 1.5),
  }),
  recording({
    id: 'rhythm',
    title: 'Syncopated rhythm',
    description: 'One pitch (A3) in eighths, dotted notes and sixteenths at 100 bpm.',
    bpm: 100,
    leadInSeconds: 1,
    articulation: 0.7,
    vibratoCents: 0,
    detuneCents: 0,
    noiseDb: -65,
    seed: 2,
    notes: sequence(
      Array(15).fill(57),
      [1, 0.5, 0.5, 0.75, 0.25, 1, 1.5, 0.5, 0.5, 0.5, 1, 0.25, 0.25, 0.5, 2],
    ),
  }),
  recording({
    id: 'slow-scale',
    title: 'Slow C major scale',
    description: 'Up and down an octave in half notes at 60 bpm, for note ordering.',
    bpm: 60,
    leadInSeconds: 1,
    articulation: 0.8,
    vibratoCents: 10,
    detuneCents: 8,
    noiseDb: -65,
    seed: 3,
    notes: sequence([...C_MAJOR, ...C_MAJOR.slice(0, -1).reverse()], 2),
  }),
  recording({
    id: 'legato-melody',
    title: 'Legato melody',
    description: 'Slurred notes with no gaps, split only by the pitch change.',
    bpm: 90,
    leadInSeconds: 1,
    articulation: 1,
    vibratoCents: 15,
    detuneCents: 8,
    noiseDb: -65,
    seed: 4,
    notes: sequence(
      [64, 62, 60, 62, 64, 67, 69, 67, 64, 62, 60, 59, 60],
      [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2],
    ),
  }),
  recording({
    id: 'monophonic-100',
    title: '100-note monophonic test',
    description:
      'Random notes from E2 to E5 at 120 bpm, with dynamics, vibrato, detune and room noise.',
    bpm: 120,
    leadInSeconds: 1,
    articulation: 0.85,
    vibratoCents: 15,
    detuneCents: 10,
    noiseDb: -60,
    seed: 100,
    notes: randomMelody(100, 100),
  }),
  recording({
    id: 'silence-and-noise',
    title: 'Silence and noise',
    description: 'Room noise, a hiss burst and clicks with no notes; nothing should be detected.',
    bpm: 120,
    leadInSeconds: 0,
    articulation: 1,
    vibratoCents: 0,
    detuneCents: 0,
    noiseDb: -60,
    seed: 6,
    seconds: 6,
    distractions: [
      { atSeconds: 1, kind: 'click', seconds: 0.004, db: -6 },
      { atSeconds: 1.8, kind: 'click', seconds: 0.004, db: -12 },
      { atSeconds: 2.5, kind: 'noise', seconds: 1.5, db: -25 },
      { atSeconds: 4.5, kind: 'click', seconds: 0.004, db: -6 },
    ],
    notes: [],
  }),
]

const HARMONICS = [1, 0.55, 0.35, 0.25, 0.15, 0.1]

/** Renders a recording as mono samples at RECORDING_SAMPLE_RATE. */
export function renderRecording(rec: TestRecording): Float32Array {
  const sr = RECORDING_SAMPLE_RATE
  const out = new Float32Array(Math.round(rec.seconds * sr))
  const rand = mulberry32(rec.seed)
  const secondsPerBeat = 60 / rec.bpm

  for (const note of rec.notes) {
    const detune = (rand() * 2 - 1) * rec.detuneCents
    const f0 = 440 * 2 ** ((note.midiPitch - 69 + detune / 100) / 12)
    const harmonics = HARMONICS.filter((_, h) => f0 * (h + 1) < sr * 0.45)
    const scale = (0.8 * note.velocity) / 127 / harmonics.reduce((a, b) => a + b, 0)
    const first = Math.round((rec.leadInSeconds + note.startBeat * secondsPerBeat) * sr)
    const n = Math.round(note.durationBeats * secondsPerBeat * rec.articulation * sr)
    const vibratoPhase = rand() * 2 * Math.PI
    let phase = 0
    for (let i = 0; i < n && first + i < out.length; i++) {
      const t = i / sr
      const vibrato =
        2 ** ((rec.vibratoCents / 1200) * Math.sin(2 * Math.PI * 5.5 * t + vibratoPhase))
      phase += (2 * Math.PI * f0 * vibrato) / sr
      // A plucked attack that settles to a sustain, with a short release so notes don't click.
      const envelope =
        Math.min(1, t / 0.005) *
        (0.45 + 0.55 * Math.exp(-t / 0.25)) *
        Math.min(1, (n - i) / (0.015 * sr))
      let sample = 0
      for (let h = 0; h < harmonics.length; h++) sample += harmonics[h] * Math.sin((h + 1) * phase)
      out[first + i] += scale * envelope * sample
    }
  }

  // Uniform noise on [-1, 1] has an RMS of 1 / sqrt(3).
  const noiseAmp = (db: number) => Math.sqrt(3) * 10 ** (db / 20)
  if (rec.noiseDb !== null) {
    const amp = noiseAmp(rec.noiseDb)
    for (let i = 0; i < out.length; i++) out[i] += amp * (rand() * 2 - 1)
  }
  for (const d of rec.distractions ?? []) {
    const first = Math.round(d.atSeconds * sr)
    const n = Math.round(d.seconds * sr)
    const amp = d.kind === 'noise' ? noiseAmp(d.db) : 10 ** (d.db / 20)
    for (let i = 0; i < n && first + i < out.length; i++) {
      out[first + i] += d.kind === 'noise' ? amp * (rand() * 2 - 1) : amp * (1 - i / n)
    }
  }
  return out
}

export interface RecordingEvaluation {
  performed: PerformedNote[]
  /** Answer-key notes matched by a detected onset within 50 ms and 1 semitone. */
  withinSemitone: number
  /** Null for recordings with no notes, which the scoring engine rejects. */
  score: ScoreResult | null
}

export function recordingAnswerKey(rec: TestRecording): AnswerKey {
  return {
    expected: rec.notes,
    tempoMap: [{ atBeat: 0, bpm: rec.bpm, timeSigNum: 4, timeSigDen: 4 }],
  }
}

/**
 * Compares notes transcribed from a recording (timed from its first sample) with an answer key.
 * `beatZeroSeconds` is where the answer key's first beat falls in the recording.
 */
export function evaluateTranscription(
  detected: DetectedNote[],
  key: AnswerKey,
  beatZeroSeconds: number,
): RecordingEvaluation {
  const performed = toPerformedNotes(detected, beatZeroSeconds)
  const withinSemitone = key.expected.filter((note) => {
    const expectedMs = beatToMs(note.startBeat, key.tempoMap)
    return performed.some(
      (p) => Math.abs(p.startMs - expectedMs) < 50 && Math.abs(p.midiPitch - note.midiPitch) <= 1,
    )
  }).length
  const score = key.expected.length ? scorePerformance({ ...key, performed }) : null
  return { performed, withinSemitone, score }
}

export function evaluateRecording(
  rec: TestRecording,
  detected: DetectedNote[],
): RecordingEvaluation {
  return evaluateTranscription(detected, recordingAnswerKey(rec), rec.leadInSeconds)
}

/** Encodes mono samples as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string) =>
    [...text].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)))
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return bytes
}
