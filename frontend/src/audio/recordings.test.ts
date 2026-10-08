import { describe, expect, it } from 'vitest'

import { answerKeyFromMidi, answerKeyToMidi } from './midi'
import {
  encodeWav,
  evaluateRecording,
  evaluateTranscription,
  RECORDING_SAMPLE_RATE,
  renderRecording,
  TEST_RECORDINGS,
  type TestRecording,
} from './recordings'
import { transcribe } from './transcribe'

const byId = (id: string) => TEST_RECORDINGS.find((r) => r.id === id) as TestRecording

// Rendering and transcribing 100 notes can exceed the default 5 seconds on CI.
const transcriptionTimeout = 30_000

function evaluate(rec: TestRecording) {
  const detected = transcribe(renderRecording(rec), RECORDING_SAMPLE_RATE)
  return { detected, ...evaluateRecording(rec, detected) }
}

describe('test recordings', () => {
  it.each(TEST_RECORDINGS.filter((r) => r.notes.length).map((r) => [r.id, r] as const))(
    '%s transcribes to every expected note and scores at least 95',
    (_, rec) => {
      const { performed, withinSemitone, score } = evaluate(rec)
      expect(performed).toHaveLength(rec.notes.length)
      expect(withinSemitone).toBe(rec.notes.length)
      expect(score?.breakdown.extraNotes).toBe(0)
      expect(score?.finalScore).toBeGreaterThanOrEqual(95)
    },
    transcriptionTimeout,
  )

  it('keeps the slow scale in order', () => {
    const rec = byId('slow-scale')
    const { performed } = evaluate(rec)
    expect(performed.map((p) => Math.round(p.midiPitch))).toEqual(rec.notes.map((n) => n.midiPitch))
  })

  it('separates repeated notes of the same pitch by their rests', () => {
    const rec = byId('rhythm')
    const { performed } = evaluate(rec)
    const msPerBeat = 60000 / rec.bpm
    performed.forEach((p, i) => {
      expect(Math.abs(p.startMs - rec.notes[i].startBeat * msPerBeat)).toBeLessThan(20)
    })
  })

  it(
    'identifies at least 95 of the 100 monophonic notes within 1 semitone',
    () => {
      const rec = byId('monophonic-100')
      expect(rec.notes).toHaveLength(100)
      expect(evaluate(rec).withinSemitone).toBeGreaterThanOrEqual(95)
    },
    transcriptionTimeout,
  )

  it(
    'follows the dynamics of the answer key',
    () => {
      const rec = byId('monophonic-100')
      const { performed } = evaluate(rec)
      const loud = rec.notes.filter((n) => n.velocity >= 100).map((n) => n.index)
      const soft = rec.notes.filter((n) => n.velocity <= 60).map((n) => n.index)
      const mean = (indices: number[]) =>
        indices.reduce((sum, i) => sum + performed[i].velocity, 0) / indices.length
      expect(mean(loud)).toBeGreaterThan(mean(soft) + 15)
    },
    transcriptionTimeout,
  )

  it('scores a recording against its answer key read back from a MIDI file', () => {
    const rec = byId('slow-scale')
    const detected = transcribe(renderRecording(rec), RECORDING_SAMPLE_RATE)
    const key = answerKeyFromMidi(answerKeyToMidi(rec.notes, rec.bpm))
    const fromMidi = evaluateTranscription(detected, key, rec.leadInSeconds)
    expect(fromMidi.withinSemitone).toBe(rec.notes.length)
    expect(fromMidi.score?.finalScore).toBe(evaluateRecording(rec, detected).score?.finalScore)
  })

  it('detects nothing in silence, noise and clicks', () => {
    expect(evaluate(byId('silence-and-noise')).detected).toEqual([])
  })

  it('renders deterministically', () => {
    const rec = byId('single-pitches')
    expect(renderRecording(rec)).toEqual(renderRecording(rec))
  })

  it('encodes a 16-bit mono WAV', () => {
    const samples = new Float32Array([0, 0.5, -1, 1])
    const wav = encodeWav(samples, 44100)
    const view = new DataView(wav.buffer)
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe('RIFF')
    expect(new TextDecoder().decode(wav.subarray(8, 12))).toBe('WAVE')
    expect(view.getUint32(24, true)).toBe(44100)
    expect(view.getUint32(40, true)).toBe(8)
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
      0, 16383, -32768, 32767,
    ])
  })
})
