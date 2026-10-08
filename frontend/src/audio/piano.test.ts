import { describe, expect, it } from 'vitest'

import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'
import { scorePerformance } from '@/scoring/score'

import {
  DEFAULT_PROFILE,
  getInstrumentProfile,
  keepNotesInRange,
  notesOutOfRange,
  PIANO_PROFILE,
} from './instruments'
import { MidiRecorder } from './midi-input'
import { PIANO_ACCURACY_RECORDINGS, PIANO_CHORD, PIANO_RECORDINGS } from './piano-recordings'
import {
  evaluateRecording,
  RECORDING_SAMPLE_RATE,
  renderRecording,
  type TestRecording,
} from './recordings'
import { transcribe } from './transcribe'

function transcribeAsPiano(rec: TestRecording) {
  const detected = transcribe(renderRecording(rec), RECORDING_SAMPLE_RATE, {
    analyzer: PIANO_PROFILE.analyzer,
    segmenter: PIANO_PROFILE.segmenter,
  })
  return evaluateRecording(rec, detected)
}

describe('piano profile', () => {
  it('is used when piano is selected', () => {
    expect(getInstrumentProfile('piano')).toBe(PIANO_PROFILE)
    expect(getInstrumentProfile('guitar')).toBe(DEFAULT_PROFILE)
  })

  it('covers all 88 keys', () => {
    expect(PIANO_PROFILE.highestMidi - PIANO_PROFILE.lowestMidi + 1).toBe(88)
  })

  it('finds scenario notes the piano cannot play', () => {
    const notes: ExpectedNote[] = [20, 21, 108, 109].map((midiPitch, index) => ({
      index,
      midiPitch,
      startBeat: index,
      durationBeats: 1,
      velocity: 100,
    }))
    expect(notesOutOfRange(notes, PIANO_PROFILE).map((n) => n.midiPitch)).toEqual([20, 109])
  })

  it('drops detected notes outside the piano range', () => {
    const notes = [12, 60, 120].map((midiPitch) => ({
      midiPitch,
      startMs: 0,
      durationMs: 100,
      velocity: 80,
    }))
    expect(keepNotesInRange(notes, PIANO_PROFILE).map((n) => n.midiPitch)).toEqual([60])
  })
})

describe('piano audio recordings', () => {
  it.each(PIANO_RECORDINGS.map((r) => [r.id, r] as const))('%s scores at least 95', (_, rec) => {
    const { withinSemitone, score } = transcribeAsPiano(rec)
    expect(withinSemitone / rec.notes.length).toBeGreaterThanOrEqual(0.95)
    expect(score?.finalScore).toBeGreaterThanOrEqual(95)
  })

  it('identifies at least 95% of 1000 notes across the low, middle and high registers', () => {
    let total = 0
    let matched = 0
    for (const rec of PIANO_ACCURACY_RECORDINGS) {
      const { withinSemitone } = transcribeAsPiano(rec)
      expect(withinSemitone / rec.notes.length).toBeGreaterThanOrEqual(0.95)
      total += rec.notes.length
      matched += withinSemitone
    }
    expect(total).toBe(1000)
    expect(matched / total).toBeGreaterThanOrEqual(0.95)
  }, 120000)

  it('hears an audio chord as one note at the right time, because detection is monophonic', () => {
    const { performed } = transcribeAsPiano(PIANO_CHORD)
    expect(performed).toHaveLength(1)
    expect(Math.abs(performed[0].startMs)).toBeLessThan(50)
  })
})

describe('MIDI digital piano', () => {
  const tempoMap: TempoMapEntry[] = [{ atBeat: 0, bpm: 60, timeSigNum: 4, timeSigDen: 4 }]

  it('scores a three-note chord perfectly', () => {
    const recorder = new MidiRecorder()
    recorder.start(0)
    for (const note of PIANO_CHORD.notes) recorder.handleMessage([0x90, note.midiPitch, 90], 5)
    for (const note of PIANO_CHORD.notes) recorder.handleMessage([0x80, note.midiPitch, 0], 1900)
    const performed = recorder.takeNotes(2000)
    const result = scorePerformance({ expected: PIANO_CHORD.notes, tempoMap, performed })
    expect(result.finalScore).toBe(100)
  })

  it('plays every key from A0 to C8', () => {
    const expected: ExpectedNote[] = []
    for (let pitch = 21; pitch <= 108; pitch++) {
      expected.push({
        index: pitch - 21,
        midiPitch: pitch,
        startBeat: pitch - 21,
        durationBeats: 1,
        velocity: 100,
      })
    }
    const recorder = new MidiRecorder()
    recorder.start(0)
    for (const note of expected) {
      recorder.handleMessage([0x90, note.midiPitch, 100], note.startBeat * 1000)
      recorder.handleMessage([0x80, note.midiPitch, 0], note.startBeat * 1000 + 800)
    }
    const performed = keepNotesInRange(recorder.takeNotes(100000), PIANO_PROFILE)
    expect(scorePerformance({ expected, tempoMap, performed }).finalScore).toBe(100)
  })
})
