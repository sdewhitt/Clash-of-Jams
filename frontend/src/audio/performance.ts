import type { PerformedNote } from '@/scoring/score'

import type { DetectedNote } from './segmenter'

/**
 * Converts detected notes to the scoring engine's input.
 * `scenarioStartTime` is the AudioContext time of scenario beat 0. Notes that end before it (the
 * count-in) are dropped; a note that starts slightly early on beat 0 is kept.
 * `latencyMs` is the user's calibrated input latency.
 */
export function toPerformedNotes(
  notes: DetectedNote[],
  scenarioStartTime: number,
  latencyMs = 0,
): PerformedNote[] {
  return notes
    .map((note) => ({
      midiPitch: note.midiPitch,
      startMs: (note.startTime - scenarioStartTime) * 1000 - latencyMs,
      durationMs: note.durationSeconds * 1000,
      velocity: note.velocity,
    }))
    .filter((note) => note.startMs + note.durationMs > 0)
}
