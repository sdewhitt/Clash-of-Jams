import { Midi } from '@tonejs/midi'

import type { PerformedNote } from './score'

/** Reads every note in a .mid file. The file's time 0 is treated as scenario start. */
export function performanceFromMidi(bytes: ArrayBuffer | ArrayLike<number>): PerformedNote[] {
  return new Midi(bytes).tracks
    .flatMap((track) => track.notes)
    .map((note) => ({
      midiPitch: note.midi,
      startMs: note.time * 1000,
      durationMs: note.duration * 1000,
      velocity: Math.round(note.velocity * 127),
    }))
}
