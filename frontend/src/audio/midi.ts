import { Midi } from '@tonejs/midi'

import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'
import type { PerformedNote } from '@/scoring/score'

/** What the scoring engine needs to grade a performance: the notes and when they fall. */
export interface AnswerKey {
  expected: ExpectedNote[]
  tempoMap: TempoMapEntry[]
}

/**
 * Reads a .mid file as an answer key. Beats are quarter notes; every track is included, and
 * the tempo map follows the file's tempo and time-signature changes.
 */
export function answerKeyFromMidi(bytes: ArrayBuffer | ArrayLike<number>): AnswerKey {
  const midi = new Midi(bytes)
  const { ppq, tempos, timeSignatures } = midi.header
  const latest = <T extends { ticks: number }>(events: T[], ticks: number) =>
    events.filter((e) => e.ticks <= ticks).at(-1)

  const changes = new Set([0, ...tempos.map((t) => t.ticks), ...timeSignatures.map((t) => t.ticks)])
  const tempoMap = [...changes]
    .sort((a, b) => a - b)
    .map((ticks) => {
      const [timeSigNum, timeSigDen] = latest(timeSignatures, ticks)?.timeSignature ?? [4, 4]
      return { atBeat: ticks / ppq, bpm: latest(tempos, ticks)?.bpm ?? 120, timeSigNum, timeSigDen }
    })

  const expected = midi.tracks
    .flatMap((track) => track.notes)
    .sort((a, b) => a.ticks - b.ticks || a.midi - b.midi)
    .map((note, index) => ({
      index,
      midiPitch: note.midi,
      startBeat: note.ticks / ppq,
      durationBeats: note.durationTicks / ppq,
      velocity: Math.round(note.velocity * 127),
    }))
  if (expected.length === 0) throw new Error('The MIDI file has no notes.')
  return { expected, tempoMap }
}

/** Pitch-bend range assumed by General MIDI players, in semitones. */
const BEND_RANGE = 2
/** @tonejs/midi writes bends as raw 14-bit values but reads them back as -1 to 1. */
const BEND_STEPS = 8192

/**
 * Writes a performance as a single-track .mid file, readable by performanceFromMidi.
 *
 * MIDI cannot hold events before time 0, so notes starting early are clipped to it.
 * Cents survive only as pitch bends, which assume a monophonic line.
 */
export function performanceToMidi(notes: PerformedNote[], bpm = 120): Uint8Array {
  const midi = new Midi()
  midi.header.setTempo(bpm)
  const track = midi.addTrack()
  for (const note of notes) {
    const start = Math.max(0, note.startMs) / 1000
    const end = (note.startMs + note.durationMs) / 1000
    if (end <= start) continue
    const nearest = Math.round(note.midiPitch)
    track.addNote({
      midi: nearest,
      time: start,
      duration: end - start,
      velocity: note.velocity / 127,
    })
    const bend = (note.midiPitch - nearest) / BEND_RANGE
    track.addPitchBend({ time: start, value: Math.round(bend * BEND_STEPS) })
  }
  return midi.toArray()
}

/** Writes expected notes at a single tempo, readable by answerKeyFromMidi. */
export function answerKeyToMidi(expected: ExpectedNote[], bpm: number): Uint8Array {
  const msPerBeat = 60000 / bpm
  return performanceToMidi(
    expected.map((note) => ({
      midiPitch: note.midiPitch,
      startMs: note.startBeat * msPerBeat,
      durationMs: note.durationBeats * msPerBeat,
      velocity: note.velocity,
    })),
    bpm,
  )
}
