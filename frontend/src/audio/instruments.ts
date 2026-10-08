import type { ExpectedNote, Instrument } from '@/lib/schema/types'
import type { PerformedNote } from '@/scoring/score'

import type { AnalyzerOptions } from './analysis'
import type { SegmenterOptions } from './segmenter'

/** How audio input is tuned for one instrument. */
export interface InstrumentProfile {
  label: string
  /** Lowest and highest MIDI pitch the instrument can play. */
  lowestMidi: number
  highestMidi: number
  analyzer: Partial<AnalyzerOptions>
  segmenter: Partial<SegmenterOptions>
}

/** A full 88-key piano: A0 (MIDI 21, 27.5 Hz) to C8 (MIDI 108, 4186 Hz). */
export const PIANO_PROFILE: InstrumentProfile = {
  label: 'Piano',
  lowestMidi: 21,
  highestMidi: 108,
  analyzer: {
    // The pitch window must hold two periods of A0 (about 73 ms), which needs 4096 samples.
    windowSize: 4096,
    minHz: 26,
    maxHz: 4300,
  },
  segmenter: {},
}

/** Used for instruments without their own profile yet. */
export const DEFAULT_PROFILE: InstrumentProfile = {
  label: 'Other',
  lowestMidi: 28,
  highestMidi: 95,
  analyzer: {},
  segmenter: {},
}

export function getInstrumentProfile(instrument: Instrument): InstrumentProfile {
  if (instrument === 'piano') return PIANO_PROFILE
  return DEFAULT_PROFILE
}

export function isInRange(midiPitch: number, profile: InstrumentProfile): boolean {
  const nearest = Math.round(midiPitch)
  return nearest >= profile.lowestMidi && nearest <= profile.highestMidi
}

/** Scenario notes the instrument cannot play, so the player can be warned before starting. */
export function notesOutOfRange(notes: ExpectedNote[], profile: InstrumentProfile): ExpectedNote[] {
  return notes.filter((note) => !isInRange(note.midiPitch, profile))
}

/** Drops detected notes the instrument cannot have played; they are noise or a wrong octave. */
export function keepNotesInRange(
  notes: PerformedNote[],
  profile: InstrumentProfile,
): PerformedNote[] {
  return notes.filter((note) => isInRange(note.midiPitch, profile))
}
