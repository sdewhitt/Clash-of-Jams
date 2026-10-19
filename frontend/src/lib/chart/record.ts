/**
 * Turns notes recorded from a MIDI controller into chart notes.
 *
 * The recorder times notes in milliseconds from beat 0 (see audio/midi-input.ts); a chart
 * stores beats. Converting through the chart's tempo map, rather than one bpm, keeps a
 * recording correct across tempo changes. The calibrated controller latency is subtracted
 * first, since every key press reaches the browser that much late.
 */
import { EDITOR_LIMITS, clampVelocity } from '@/lib/chart/edits'
import type { NoteInput } from '@/lib/chart/edits'
import { msToBeat } from '@/lib/chart/notes'
import type { NoteChart } from '@/lib/schema/types'
import type { PerformedNote } from '@/scoring/score'

export interface RecordOptions {
  /** Calibrated controller latency, subtracted from every onset. */
  offsetMs?: number
  /** Grid to quantize onsets and lengths to, in beats; null keeps them as played. */
  snapBeats?: number | null
}

/** Beats are kept to this many decimals, so a recording does not store float noise. */
const BEAT_PRECISION = 1000

export function recordedToNotes(
  recorded: readonly PerformedNote[],
  chart: NoteChart,
  { offsetMs = 0, snapBeats = null }: RecordOptions = {},
): NoteInput[] {
  const notes: NoteInput[] = []
  for (const note of recorded) {
    const startMs = note.startMs - offsetMs
    let startBeat = msToBeat(chart, startMs)
    let endBeat = msToBeat(chart, startMs + note.durationMs)

    if (snapBeats) {
      startBeat = Math.round(startBeat / snapBeats) * snapBeats
      endBeat = Math.max(startBeat + snapBeats, Math.round(endBeat / snapBeats) * snapBeats)
    }
    // A note played just before beat 0 belongs on it, not off the chart.
    if (startBeat < 0 && startBeat > -(snapBeats ?? EDITOR_LIMITS.minDurationBeats)) startBeat = 0

    notes.push({
      midiPitch: Math.round(note.midiPitch),
      startBeat: roundBeat(startBeat),
      durationBeats: roundBeat(Math.max(EDITOR_LIMITS.minDurationBeats, endBeat - startBeat)),
      velocity: clampVelocity(note.velocity),
    })
  }
  return notes
}

function roundBeat(beat: number) {
  return Math.round(beat * BEAT_PRECISION) / BEAT_PRECISION
}
