/**
 * Pure note-chart edits for the scenario editor.
 *
 * Every function takes a chart and returns a new one, leaving the input
 * untouched, so the editor can hold a chart in React state and the same
 * functions can be exercised without a browser. An edit that would place a note
 * outside the editor's pitch or time range is rejected: the chart comes back
 * unchanged (identical by reference) rather than storing something unplayable.
 *
 * Notes are kept sorted by onset, and ExpectedNote.index is always the note's
 * position in that sorted list, so an index is only valid against the chart it
 * was read from.
 */
import type { ChartPart, ExpectedNote, NoteChart } from '@/lib/schema/types'

/** What the editor will accept. C2 to C6 covers the ranges we score today. */
export interface ChartLimits {
  minPitch: number
  maxPitch: number
  maxBeat: number
  minDurationBeats: number
}

export const EDITOR_LIMITS: ChartLimits = {
  minPitch: 36,
  maxPitch: 84,
  maxBeat: 1024,
  minDurationBeats: 1 / 16,
}

/** Mezzo-forte, for notes placed with the mouse. */
export const DEFAULT_VELOCITY = 80

/** MIDI's velocity range; 0 would be a note-off. */
export const MIN_VELOCITY = 1
export const MAX_VELOCITY = 127

export interface NoteInput {
  midiPitch: number
  startBeat: number
  durationBeats: number
  velocity?: number
}

export function isNoteInRange(note: NoteInput, limits: ChartLimits = EDITOR_LIMITS) {
  return (
    Number.isFinite(note.midiPitch) &&
    Number.isFinite(note.startBeat) &&
    Number.isFinite(note.durationBeats) &&
    note.midiPitch >= limits.minPitch &&
    note.midiPitch <= limits.maxPitch &&
    note.startBeat >= 0 &&
    note.durationBeats >= limits.minDurationBeats &&
    note.startBeat + note.durationBeats <= limits.maxBeat
  )
}

/** Sorts by onset, then pitch, and renumbers index to match. */
export function normalizeNotes(notes: readonly ExpectedNote[]): ExpectedNote[] {
  return [...notes]
    .sort((a, b) => a.startBeat - b.startBeat || a.midiPitch - b.midiPitch)
    .map((note, index) => (note.index === index ? note : { ...note, index }))
}

export function addNote(
  chart: NoteChart,
  partId: string,
  note: NoteInput,
  limits: ChartLimits = EDITOR_LIMITS,
): NoteChart {
  if (!isNoteInRange(note, limits)) return chart
  return mapPart(chart, partId, (part) =>
    normalizeNotes([
      ...part.notes,
      {
        index: part.notes.length,
        midiPitch: note.midiPitch,
        startBeat: note.startBeat,
        durationBeats: note.durationBeats,
        velocity: note.velocity ?? DEFAULT_VELOCITY,
      },
    ]),
  )
}

/**
 * Adds many notes at once, as a MIDI recording does. Notes outside the limits are dropped
 * rather than failing the batch; with `replace`, the part's existing notes go first.
 */
export function addNotes(
  chart: NoteChart,
  partId: string,
  notes: readonly NoteInput[],
  { replace = false, limits = EDITOR_LIMITS }: { replace?: boolean; limits?: ChartLimits } = {},
): NoteChart {
  const accepted = notes.filter((note) => isNoteInRange(note, limits))
  if (accepted.length === 0 && !replace) return chart
  return mapPart(chart, partId, (part) =>
    normalizeNotes([
      ...(replace ? [] : part.notes),
      ...accepted.map((note) => ({
        index: 0,
        midiPitch: note.midiPitch,
        startBeat: note.startBeat,
        durationBeats: note.durationBeats,
        velocity: clampVelocity(note.velocity ?? DEFAULT_VELOCITY),
      })),
    ]),
  )
}

export function removeNote(chart: NoteChart, partId: string, index: number): NoteChart {
  const part = findPart(chart, partId)
  if (!part?.notes[index]) return chart
  return mapPart(chart, partId, (target) =>
    normalizeNotes(target.notes.filter((_, at) => at !== index)),
  )
}

/** Repositions a note. Its duration and velocity ride along unchanged. */
export function moveNote(
  chart: NoteChart,
  partId: string,
  index: number,
  to: { midiPitch: number; startBeat: number },
  limits: ChartLimits = EDITOR_LIMITS,
): NoteChart {
  return replaceNote(chart, partId, index, (note) => ({ ...note, ...to }), limits)
}

/** Changes how long a note is held, leaving its pitch and onset alone. */
export function resizeNote(
  chart: NoteChart,
  partId: string,
  index: number,
  durationBeats: number,
  limits: ChartLimits = EDITOR_LIMITS,
): NoteChart {
  return replaceNote(chart, partId, index, (note) => ({ ...note, durationBeats }), limits)
}

/** Changes a note's dynamics, leaving its pitch, onset and length alone. */
export function setVelocity(
  chart: NoteChart,
  partId: string,
  index: number,
  velocity: number,
  limits: ChartLimits = EDITOR_LIMITS,
): NoteChart {
  if (!Number.isFinite(velocity)) return chart
  const clamped = clampVelocity(velocity)
  if (findPart(chart, partId)?.notes[index]?.velocity === clamped) return chart
  return replaceNote(chart, partId, index, (note) => ({ ...note, velocity: clamped }), limits)
}

export function clampVelocity(velocity: number) {
  return Math.min(MAX_VELOCITY, Math.max(MIN_VELOCITY, Math.round(velocity)))
}

/** Finds a note by its values, which is how a freshly added one is located. */
export function noteIndexAt(
  chart: NoteChart,
  partId: string,
  midiPitch: number,
  startBeat: number,
) {
  const notes = findPart(chart, partId)?.notes ?? []
  return notes.findIndex((note) => note.midiPitch === midiPitch && note.startBeat === startBeat)
}

export function findPart(chart: NoteChart, partId: string): ChartPart | undefined {
  return chart.parts.find((part) => part.partId === partId)
}

function replaceNote(
  chart: NoteChart,
  partId: string,
  index: number,
  edit: (note: ExpectedNote) => ExpectedNote,
  limits: ChartLimits,
): NoteChart {
  const existing = findPart(chart, partId)?.notes[index]
  if (!existing) return chart

  const edited = edit(existing)
  if (!isNoteInRange(edited, limits)) return chart

  return mapPart(chart, partId, (part) =>
    normalizeNotes(part.notes.map((note, at) => (at === index ? edited : note))),
  )
}

function mapPart(
  chart: NoteChart,
  partId: string,
  edit: (part: ChartPart) => ExpectedNote[],
): NoteChart {
  if (!findPart(chart, partId)) return chart
  return {
    ...chart,
    parts: chart.parts.map((part) =>
      part.partId === partId ? { ...part, notes: edit(part) } : part,
    ),
  }
}
