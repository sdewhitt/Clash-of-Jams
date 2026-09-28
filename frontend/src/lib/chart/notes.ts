/**
 * Beat, bar and pitch arithmetic for note charts.
 *
 * The schema stores note onsets in beats (see docs/firestore-schema.md), and
 * this module fixes what a beat means for everything downstream: one beat is a
 * quarter note and `TempoMapEntry.bpm` counts quarter notes per minute, so a
 * 6/8 bar is three beats rather than six. Nothing here touches Firestore or
 * React, so the editor and any future scoring code can share it.
 */
import type { NoteChart, TempoMapEntry } from '@/lib/schema/types'

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** "C4" for MIDI 60, following the convention where middle C is C4. */
export function pitchName(midiPitch: number) {
  return `${PITCH_CLASSES[midiPitch % 12]}${Math.floor(midiPitch / 12) - 1}`
}

export function isBlackKey(midiPitch: number) {
  return PITCH_CLASSES[midiPitch % 12].length === 2
}

/** Beats in one bar of the given meter, in quarter-note beats. */
export function beatsPerBar(entry: TempoMapEntry) {
  return (entry.timeSigNum * 4) / entry.timeSigDen
}

/** The tempo and meter in force at a beat; charts always carry an entry at 0. */
export function tempoAt(chart: NoteChart, beat: number): TempoMapEntry {
  const sorted = sortedTempoMap(chart)
  let current = sorted[0]
  for (const entry of sorted) {
    if (entry.atBeat > beat) break
    current = entry
  }
  return current
}

/** Wall-clock position of a beat, walking every tempo change on the way. */
export function beatToMs(chart: NoteChart, beat: number) {
  const sorted = sortedTempoMap(chart)
  let ms = 0
  for (let i = 0; i < sorted.length; i++) {
    const from = Math.max(sorted[i].atBeat, 0)
    if (from >= beat) break
    const nextAt = sorted[i + 1]?.atBeat ?? beat
    ms += ((Math.min(beat, nextAt) - from) / sorted[i].bpm) * 60_000
  }
  return ms
}

/** The beat the last note lets go, or 0 for an empty chart. */
export function chartEndBeat(chart: NoteChart) {
  let end = 0
  for (const part of chart.parts) {
    for (const note of part.notes) {
      end = Math.max(end, note.startBeat + note.durationBeats)
    }
  }
  return end
}

/** What Run scoring and ScenarioVersion.durationMs record as the length. */
export function chartDurationMs(chart: NoteChart) {
  return Math.round(beatToMs(chart, chartEndBeat(chart)))
}

function sortedTempoMap(chart: NoteChart) {
  return [...chart.tempoMap].sort((a, b) => a.atBeat - b.atBeat)
}
