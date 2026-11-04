/**
 * Page layout for a Score: which measures share a system (a line of music), how wide each
 * event is, and where every staff position and tick lands in pixels.
 *
 * Spacing follows the usual engraving rule of thumb -- longer notes get more room, but
 * less than proportionally (square root of the duration) -- and each full system is then
 * stretched to the page width. The geometry is pure so the component can stay a renderer
 * and the click-to-pitch and click-to-time maths can be tested on their own.
 */
import type { Instrument } from '@/lib/schema/types'
import { TICKS_PER_BEAT } from '@/lib/notation/score'
import type { Measure, Score, ScoreEvent } from '@/lib/notation/score'

/** Distance between two staff lines; a staff position (line or space) is half of it. */
export const SPACE = 10
export const STEP = SPACE / 2
export const STAFF_HEIGHT = SPACE * 4

/** The middle line, as a staff position counted from the bottom line (0) upward. */
export const MIDDLE_LINE = 4

const MARGIN = 12
const CLEF_WIDTH = 38
const KEY_ACCIDENTAL_WIDTH = 9
const TIME_SIG_WIDTH = 30
const MEASURE_PAD = 10
const WHOLE_BAR_REST_WIDTH = 60
/** Room above the staff for measure numbers and below it before the next system. */
const MIN_ABOVE = 34
const MIN_BELOW = 26

export type ClefKind = 'treble' | 'bass' | 'treble-8vb'

export interface ClefDefinition {
  label: string
  /** The glyph drawn: treble-8vb is a treble clef with a small 8 beneath. */
  glyph: 'treble' | 'bass'
  /** Diatonic number of the sounding pitch on the bottom line. */
  bottomLine: number
}

export const CLEFS: Record<ClefKind, ClefDefinition> = {
  // E4: 4 * 7 + 2.
  treble: { label: 'Treble', glyph: 'treble', bottomLine: 30 },
  // G2: 2 * 7 + 4.
  bass: { label: 'Bass', glyph: 'bass', bottomLine: 18 },
  // Guitar reads treble an octave above where it sounds, so the bottom line sounds E3.
  'treble-8vb': { label: 'Guitar (treble 8vb)', glyph: 'treble', bottomLine: 23 },
}

/** Staff positions of each sharp and flat in a treble key signature; bass sits two lower. */
export const SHARP_POSITIONS = [8, 5, 9, 6, 3, 7, 4]
export const FLAT_POSITIONS = [4, 7, 3, 6, 2, 5, 1]

/** Guitar reads its own clef; anything else follows where most of its notes sit. */
export function autoClef(instrument: Instrument, pitches: readonly number[]): ClefKind {
  if (instrument === 'guitar') return 'treble-8vb'
  if (pitches.length === 0) return 'treble'
  const sorted = [...pitches].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] < 57 ? 'bass' : 'treble'
}

export interface PlacedEvent {
  event: ScoreEvent
  /** Left edge of the event's slot. */
  left: number
  /** Centre of the notehead column (or the rest). */
  x: number
}

export interface PlacedMeasure {
  measure: Measure
  x: number
  width: number
  events: PlacedEvent[]
}

export interface SystemLayout {
  index: number
  /** Top of the system's band, including the room above the staff. */
  top: number
  bottom: number
  staffTop: number
  /** Where the staff lines start and end. */
  x0: number
  x1: number
  /** Where the first measure starts, after clef, key and (on the first system) time. */
  contentX: number
  showTimeSignature: boolean
  measures: PlacedMeasure[]
}

export interface ScoreLayout {
  width: number
  height: number
  clef: ClefKind
  systems: SystemLayout[]
}

/** Staff position of a written note: 0 is the bottom line, 8 the top. */
export function staffPosition(diatonic: number, clef: ClefKind) {
  return diatonic - CLEFS[clef].bottomLine
}

export function staffY(system: SystemLayout, position: number) {
  return system.staffTop + STAFF_HEIGHT - position * STEP
}

/** The staff position under a y coordinate, snapped to the nearest line or space. */
export function positionAt(system: SystemLayout, y: number) {
  return Math.round((system.staffTop + STAFF_HEIGHT - y) / STEP)
}

/** Room a notehead's accidental takes to its left. */
export function accidentalRoom(event: ScoreEvent) {
  return event.notes.some((note) => note.accidental) ? 12 : 0
}

export function eventWidth(event: ScoreEvent) {
  if (event.wholeBar) return WHOLE_BAR_REST_WIDTH
  const base = 16 + 26 * Math.sqrt(event.ticks / TICKS_PER_BEAT)
  return Math.round(base + accidentalRoom(event) + (event.dotted ? 6 : 0))
}

function headerWidth(fifths: number, showTimeSignature: boolean) {
  const key = Math.abs(fifths)
  return (
    CLEF_WIDTH +
    key * KEY_ACCIDENTAL_WIDTH +
    (key > 0 ? 6 : 0) +
    (showTimeSignature ? TIME_SIG_WIDTH : 0)
  )
}

export function layoutScore(score: Score, clef: ClefKind, width: number): ScoreLayout {
  const natural = score.measures.map(
    (measure) =>
      MEASURE_PAD + measure.events.reduce((sum, event) => sum + eventWidth(event), 0) + 4,
  )

  // Greedy line breaking: as many measures as fit, at least one per system.
  const lines: number[][] = []
  let current: number[] = []
  let used = 0
  score.measures.forEach((_, index) => {
    const available = width - 2 * MARGIN - headerWidth(score.fifths, lines.length === 0)
    if (current.length > 0 && used + natural[index] > available) {
      lines.push(current)
      current = []
      used = 0
    }
    current.push(index)
    used += natural[index]
  })
  if (current.length > 0) lines.push(current)

  const systems: SystemLayout[] = []
  let top = 0
  lines.forEach((indices, lineIndex) => {
    const showTimeSignature = lineIndex === 0
    const x0 = MARGIN
    const contentX = x0 + headerWidth(score.fifths, showTimeSignature)
    const available = width - MARGIN - contentX
    const total = indices.reduce((sum, index) => sum + natural[index], 0)
    const isLast = lineIndex === lines.length - 1
    // A short last line keeps natural spacing instead of being pulled across the page.
    const scale = isLast && total < available * 0.6 ? 1 : available / total

    let x = contentX
    const measures = indices.map((index) => {
      const measure = score.measures[index]
      const measureWidth = natural[index] * scale
      let left = x + MEASURE_PAD * scale
      const events = measure.events.map((event) => {
        const slot = eventWidth(event) * scale
        const placed = {
          event,
          left,
          x: event.wholeBar ? x + measureWidth / 2 : left + accidentalRoom(event) + 8,
        }
        left += slot
        return placed
      })
      const placed = { measure, x, width: measureWidth, events }
      x += measureWidth
      return placed
    })

    const positions = measures.flatMap((measure) =>
      measure.events.flatMap((placed) =>
        placed.event.notes.map((note) => staffPosition(note.spelled.diatonic, clef)),
      ),
    )
    // Leave room for ledger notes and their stems.
    const highest = Math.max(8, ...positions.map((position) => position + 7))
    const lowest = Math.min(0, ...positions.map((position) => position - 7))
    const above = Math.max(MIN_ABOVE, (highest - 8) * STEP + 18)
    const below = Math.max(MIN_BELOW, -lowest * STEP + 14)

    const staffTop = top + above
    const bottom = staffTop + STAFF_HEIGHT + below
    systems.push({
      index: lineIndex,
      top,
      bottom,
      staffTop,
      x0,
      x1: x,
      contentX,
      showTimeSignature,
      measures,
    })
    top = bottom
  })

  return { width, height: top, clef, systems }
}

/** The system whose band contains y, or the nearest one. */
export function systemAt(layout: ScoreLayout, y: number) {
  return (
    layout.systems.find((system) => y >= system.top && y < system.bottom) ??
    (y < 0 ? layout.systems[0] : layout.systems.at(-1))
  )
}

/** Ticks and x positions that time is interpolated between within a system. */
function anchors(system: SystemLayout) {
  const points: { tick: number; x: number }[] = []
  for (const measure of system.measures) {
    for (const placed of measure.events) {
      points.push({
        tick: placed.event.startTick,
        x: placed.event.wholeBar ? measure.x + MEASURE_PAD : placed.x - 8,
      })
    }
    points.push({
      tick: measure.measure.startTick + measure.measure.ticks,
      x: measure.x + measure.width,
    })
  }
  return points
}

export function tickToX(system: SystemLayout, tick: number) {
  const points = anchors(system)
  if (tick <= points[0].tick) return points[0].x
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (tick <= b.tick) {
      return b.tick === a.tick ? b.x : a.x + ((tick - a.tick) / (b.tick - a.tick)) * (b.x - a.x)
    }
  }
  return points.at(-1)!.x
}

export function xToTick(system: SystemLayout, x: number) {
  const points = anchors(system)
  if (x <= points[0].x) return points[0].tick
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (x <= b.x) {
      return b.x === a.x ? b.tick : a.tick + ((x - a.x) / (b.x - a.x)) * (b.tick - a.tick)
    }
  }
  return points.at(-1)!.tick
}

/** The system a tick falls in; the end of the score belongs to the last one. */
export function systemForTick(layout: ScoreLayout, tick: number) {
  return (
    layout.systems.find((system) => {
      const first = system.measures[0].measure
      const last = system.measures.at(-1)!.measure
      return tick >= first.startTick && tick < last.startTick + last.ticks
    }) ?? layout.systems.at(-1)!
  )
}
