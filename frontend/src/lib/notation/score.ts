/**
 * Turns a chart part into notated measures: chords and rests with written durations,
 * ties, accidentals and beam groups. Nothing here knows about pixels -- engrave.ts places
 * the result on a page.
 *
 * A chart is free-form time (onsets and lengths in beats), while notation only has
 * whole, half, quarter and so on down to 64ths. The bridge is a tick grid of 1/16 beat,
 * the shortest note the editor accepts: every onset and length is rounded onto it, and any
 * whole number of ticks can be written as tied notes. Durations are split at bar lines and
 * at beat-group boundaries the way an engraver would, so syncopations show where the beat
 * falls instead of hiding it.
 *
 * The staff is a single voice. Notes starting together become one chord, and a note still
 * sounding when the next one starts is drawn cut off at that onset; the chart itself is
 * never changed by how it is displayed.
 */
import { findPart } from '@/lib/chart/edits'
import { beatsPerBar, tempoAt } from '@/lib/chart/notes'
import type { NoteChart } from '@/lib/schema/types'
import { accidentalFor, clampFifths, keyAlters, spellPitch } from '@/lib/notation/spelling'
import type { Accidental, SpelledPitch } from '@/lib/notation/spelling'

/** Ticks in one beat (a quarter note); one tick is a 64th note. */
export const TICKS_PER_BEAT = 16

export const NOTE_TYPES = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th'] as const
export type NoteType = (typeof NOTE_TYPES)[number]

export const TYPE_TICKS: Record<NoteType, number> = {
  whole: 64,
  half: 32,
  quarter: 16,
  eighth: 8,
  '16th': 4,
  '32nd': 2,
  '64th': 1,
}

export function durationTicks(type: NoteType, dotted: boolean) {
  return dotted ? TYPE_TICKS[type] * 1.5 : TYPE_TICKS[type]
}

/** Flags on a lone note, or beams on a beamed one: eighth 1 through 64th 4. */
export function flagCount(type: NoteType) {
  return Math.max(0, NOTE_TYPES.indexOf(type) - 2)
}

export function toTicks(beats: number) {
  return Math.round(beats * TICKS_PER_BEAT)
}

/** Every writable duration, longest first. A dotted 64th is not a whole tick, so it is out. */
const NOTATABLE = NOTE_TYPES.flatMap((type) => [
  { type, dotted: true, ticks: durationTicks(type, true) },
  { type, dotted: false, ticks: durationTicks(type, false) },
])
  .filter((duration) => Number.isInteger(duration.ticks))
  .sort((a, b) => b.ticks - a.ticks)

export interface StaffNote {
  /** The note's index in the chart part, so an edit can find it. */
  noteIndex: number
  midiPitch: number
  spelled: SpelledPitch
  /** The accidental to print, or null when the key or the bar already implies it. */
  accidental: Accidental | null
  /** Tied on to the next event (the note continues). */
  tieStart: boolean
  /** Tied from the previous event (this is a continuation, not a new attack). */
  tieEnd: boolean
}

export interface ScoreEvent {
  kind: 'chord' | 'rest'
  startTick: number
  ticks: number
  type: NoteType
  dotted: boolean
  /** Lowest first; empty for a rest. */
  notes: StaffNote[]
  /** Events sharing a number are beamed together. */
  beam: number | null
  /** A rest filling the whole bar, drawn as a centred whole rest whatever the meter. */
  wholeBar: boolean
}

export interface Measure {
  index: number
  startTick: number
  ticks: number
  events: ScoreEvent[]
}

export interface Score {
  measures: Measure[]
  barTicks: number
  /** The beat grouping that durations are split at and beams follow. */
  groupTicks: number
  fifths: number
  timeSigNum: number
  timeSigDen: number
  totalTicks: number
}

interface Span {
  start: number
  end: number
  notes: { index: number; midiPitch: number }[] | null
}

/**
 * Compound meters (6/8, 9/8, 12/8, and 3/8) group in dotted quarters; everything else
 * groups in the denominator's own beat.
 */
export function groupTicksFor(timeSigNum: number, timeSigDen: number) {
  return timeSigDen === 8 && timeSigNum % 3 === 0 ? 24 : (TICKS_PER_BEAT * 4) / timeSigDen
}

export function buildScore(chart: NoteChart, partId: string, minBars = 4): Score {
  const tempo = tempoAt(chart, 0)
  const barTicks = Math.max(1, toTicks(beatsPerBar(tempo)))
  const groupTicks = groupTicksFor(tempo.timeSigNum, tempo.timeSigDen)
  const fifths = clampFifths(chart.keySignature)

  const spans = toSpans(findPart(chart, partId)?.notes ?? [])
  const contentEnd = spans.at(-1)?.end ?? 0
  // A bar beyond content that ends on a bar line, so there is always somewhere to write.
  const bars = Math.max(minBars, Math.floor(contentEnd / barTicks) + 1)
  const totalTicks = bars * barTicks
  if (contentEnd < totalTicks) spans.push({ start: contentEnd, end: totalTicks, notes: null })

  const measures: Measure[] = []
  let spanAt = 0
  let beamId = 0
  for (let index = 0; index < bars; index++) {
    const start = index * barTicks
    const end = start + barTicks
    const events: ScoreEvent[] = []

    while (spans[spanAt] && spans[spanAt].end <= start) spanAt++
    for (let at = spanAt; spans[at] && spans[at].start < end; at++) {
      events.push(...spanEvents(spans[at], start, end, groupTicks, fifths))
    }

    markAccidentals(events, fifths)
    beamId = markBeams(events, start, groupTicks, beamId)
    measures.push({ index, startTick: start, ticks: barTicks, events })
  }

  return {
    measures,
    barTicks,
    groupTicks,
    fifths,
    timeSigNum: tempo.timeSigNum,
    timeSigDen: tempo.timeSigDen,
    totalTicks,
  }
}

/**
 * Splits [from, to) -- ticks from the start of a bar -- into writable durations. A piece
 * starting off a beat group stops at the next one, so the beat stays visible.
 */
export function splitDuration(from: number, to: number, groupTicks: number) {
  const pieces: { offset: number; ticks: number; type: NoteType; dotted: boolean }[] = []
  let at = from
  while (at < to) {
    const limit =
      at % groupTicks === 0 ? to : Math.min(to, (Math.floor(at / groupTicks) + 1) * groupTicks)
    const duration = NOTATABLE.find((candidate) => candidate.ticks <= limit - at)!
    pieces.push({ offset: at, ...duration })
    at += duration.ticks
  }
  return pieces
}

/** Notes grouped into chords on the tick grid, with rests filling the gaps between them. */
function toSpans(
  notes: readonly { midiPitch: number; startBeat: number; durationBeats: number }[],
) {
  const byStart = new Map<number, { index: number; midiPitch: number; end: number }[]>()
  notes.forEach((note, index) => {
    const start = toTicks(note.startBeat)
    const end = Math.max(start + 1, toTicks(note.startBeat + note.durationBeats))
    const chord = byStart.get(start) ?? []
    chord.push({ index, midiPitch: note.midiPitch, end })
    byStart.set(start, chord)
  })

  const starts = [...byStart.keys()].sort((a, b) => a - b)
  const spans: Span[] = []
  let cursor = 0
  starts.forEach((start, at) => {
    const chord = byStart.get(start)!
    const end = Math.min(starts[at + 1] ?? Infinity, Math.max(...chord.map((note) => note.end)))
    if (start > cursor) spans.push({ start: cursor, end: start, notes: null })
    // The same pitch twice at one onset draws once.
    const unique = chord
      .sort((a, b) => a.midiPitch - b.midiPitch)
      .filter((note, i, all) => i === 0 || all[i - 1].midiPitch !== note.midiPitch)
    spans.push({ start, end, notes: unique })
    cursor = end
  })
  return spans
}

function spanEvents(
  span: Span,
  barStart: number,
  barEnd: number,
  groupTicks: number,
  fifths: number,
): ScoreEvent[] {
  const from = Math.max(span.start, barStart)
  const to = Math.min(span.end, barEnd)

  if (!span.notes && from === barStart && to === barEnd) {
    return [
      {
        kind: 'rest',
        startTick: from,
        ticks: to - from,
        type: 'whole',
        dotted: false,
        notes: [],
        beam: null,
        wholeBar: true,
      },
    ]
  }

  return splitDuration(from - barStart, to - barStart, groupTicks).map((piece) => {
    const startTick = barStart + piece.offset
    const first = startTick === span.start
    const last = startTick + piece.ticks === span.end
    return {
      kind: span.notes ? 'chord' : 'rest',
      startTick,
      ticks: piece.ticks,
      type: piece.type,
      dotted: piece.dotted,
      notes: (span.notes ?? []).map((note) => ({
        noteIndex: note.index,
        midiPitch: note.midiPitch,
        spelled: spellPitch(note.midiPitch, fifths),
        accidental: null,
        tieStart: !last,
        tieEnd: !first,
      })),
      beam: null,
      wholeBar: false,
    }
  })
}

/**
 * An accidental lasts to the end of its bar, at that staff position. A tied continuation
 * never prints one: it is the same note still sounding.
 */
function markAccidentals(events: ScoreEvent[], fifths: number) {
  const alters = keyAlters(fifths)
  const inForce = new Map<number, number>()
  for (const event of events) {
    for (const note of event.notes) {
      if (note.tieEnd) continue
      const { diatonic, step, alter } = note.spelled
      if (alter !== (inForce.get(diatonic) ?? alters[step])) {
        note.accidental = accidentalFor(alter)
        inForce.set(diatonic, alter)
      }
    }
  }
}

/** Runs of flagged chords within one beat group share a beam; a rest breaks the run. */
function markBeams(events: ScoreEvent[], barStart: number, groupTicks: number, nextId: number) {
  let run: ScoreEvent[] = []
  let runGroup = -1
  const flush = () => {
    if (run.length > 1) {
      const id = nextId++
      for (const event of run) event.beam = id
    }
    run = []
  }

  for (const event of events) {
    const group = Math.floor((event.startTick - barStart) / groupTicks)
    if (event.kind === 'chord' && flagCount(event.type) > 0) {
      if (group !== runGroup) flush()
      run.push(event)
      runGroup = group
    } else {
      flush()
      runGroup = -1
    }
  }
  flush()
  return nextId
}
