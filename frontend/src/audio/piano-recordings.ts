import type { ExpectedNote } from '@/lib/schema/types'

import type { TestRecording } from './recordings'

/**
 * Makes a monophonic piano phrase that walks around a register in steps of 7 semitones,
 * so every key in the register gets played. Velocities vary to give it dynamics.
 */
function pianoPhrase(args: {
  id: string
  title: string
  description: string
  lowest: number
  highest: number
  count: number
  beatsPerNote: number
  bpm: number
  seed: number
}): TestRecording {
  const span = args.highest - args.lowest + 1
  const notes: ExpectedNote[] = []
  for (let i = 0; i < args.count; i++) {
    notes.push({
      index: i,
      midiPitch: args.lowest + ((i * 7) % span),
      startBeat: i * args.beatsPerNote,
      durationBeats: args.beatsPerNote,
      velocity: 50 + ((i * 13) % 70),
    })
  }

  const leadInSeconds = 1
  const playingSeconds = (args.count * args.beatsPerNote * 60) / args.bpm
  return {
    id: args.id,
    title: args.title,
    description: args.description,
    bpm: args.bpm,
    leadInSeconds,
    articulation: 0.85,
    vibratoCents: 0,
    detuneCents: 8,
    noiseDb: -60,
    seed: args.seed,
    seconds: leadInSeconds + playingSeconds + 1,
    notes,
  }
}

const LOW = { lowest: 21, highest: 47 } // A0 to B2
const MIDDLE = { lowest: 48, highest: 83 } // C3 to B5
const HIGH = { lowest: 84, highest: 108 } // C6 to C8

export const PIANO_RECORDINGS: TestRecording[] = [
  pianoPhrase({
    id: 'piano-single-notes',
    title: 'Piano: single notes',
    description: 'Slow, separate notes from the lowest key (A0) to the highest (C8).',
    lowest: 21,
    highest: 108,
    count: 12,
    beatsPerNote: 2,
    bpm: 90,
    seed: 21,
  }),
  pianoPhrase({
    id: 'piano-low',
    title: 'Piano: low register',
    description: 'A0 to B2 in quarter notes at 120 bpm.',
    ...LOW,
    count: 40,
    beatsPerNote: 1,
    bpm: 120,
    seed: 22,
  }),
  pianoPhrase({
    id: 'piano-middle',
    title: 'Piano: middle register',
    description: 'C3 to B5 in quarter notes at 120 bpm.',
    ...MIDDLE,
    count: 40,
    beatsPerNote: 1,
    bpm: 120,
    seed: 23,
  }),
  pianoPhrase({
    id: 'piano-high',
    title: 'Piano: high register',
    description: 'C6 to C8 in quarter notes at 120 bpm.',
    ...HIGH,
    count: 40,
    beatsPerNote: 1,
    bpm: 120,
    seed: 24,
  }),
  pianoPhrase({
    id: 'piano-fast',
    title: 'Piano: fast phrase',
    description: 'Eighth notes at 160 bpm in the middle register.',
    ...MIDDLE,
    count: 40,
    beatsPerNote: 0.5,
    bpm: 160,
    seed: 25,
  }),
  pianoPhrase({
    id: 'piano-slow',
    title: 'Piano: slow phrase',
    description: 'Whole notes at 60 bpm across the keyboard.',
    lowest: 21,
    highest: 108,
    count: 8,
    beatsPerNote: 4,
    bpm: 60,
    seed: 26,
  }),
]

/** About 1000 monophonic notes split across the low, middle and high registers. */
export const PIANO_ACCURACY_RECORDINGS: TestRecording[] = [
  pianoPhrase({
    id: 'piano-1000-low',
    title: 'Piano accuracy: low',
    description: '333 low notes.',
    ...LOW,
    count: 333,
    beatsPerNote: 0.5,
    bpm: 120,
    seed: 31,
  }),
  pianoPhrase({
    id: 'piano-1000-middle',
    title: 'Piano accuracy: middle',
    description: '334 middle notes.',
    ...MIDDLE,
    count: 334,
    beatsPerNote: 0.5,
    bpm: 160,
    seed: 32,
  }),
  pianoPhrase({
    id: 'piano-1000-high',
    title: 'Piano accuracy: high',
    description: '333 high notes.',
    ...HIGH,
    count: 333,
    beatsPerNote: 0.5,
    bpm: 160,
    seed: 33,
  }),
]

/** A C major triad (C4, E4, G4) struck together and held. */
export const PIANO_CHORD: TestRecording = {
  id: 'piano-chord',
  title: 'Piano: C major chord',
  description:
    'Three notes struck at once. Audio detection follows one pitch at a time, so only one note is heard; use MIDI for chords.',
  bpm: 60,
  leadInSeconds: 1,
  articulation: 0.85,
  vibratoCents: 0,
  detuneCents: 0,
  noiseDb: -60,
  seed: 27,
  seconds: 4,
  notes: [60, 64, 67].map((midiPitch, index) => ({
    index,
    midiPitch,
    startBeat: 0,
    durationBeats: 2,
    velocity: 90,
  })),
}
