import { DEFAULT_SCORING_RULES } from '@/lib/schema/collections'
import type {
  ExpectedNote,
  HitVerdict,
  NoteResult,
  ScoreBreakdown,
  ScoringRules,
  TempoMapEntry,
} from '@/lib/schema/types'

/** One played note, timed in milliseconds from scenario start. */
export interface PerformedNote {
  /** Fractional values carry pitch deviation: 60.25 is C4 plus 25 cents. */
  midiPitch: number
  startMs: number
  durationMs: number
  velocity: number
}

export interface ScoreResult {
  /** Integer from 0 to MAX_SCORE. */
  finalScore: number
  breakdown: ScoreBreakdown
}

/** Converts a beat position to milliseconds. tempoMap must be sorted and start at beat 0. */
export function beatToMs(beat: number, tempoMap: TempoMapEntry[]): number {
  let ms = 0
  for (let i = 0; i < tempoMap.length; i++) {
    const { atBeat, bpm } = tempoMap[i]
    if (beat <= atBeat) break
    const segmentEnd = Math.min(beat, tempoMap[i + 1]?.atBeat ?? Infinity)
    ms += ((segmentEnd - atBeat) * 60000) / bpm
  }
  return ms
}

export const MAX_SCORE = 100_000

const round2 = (x: number) => Math.round(x * 100) / 100

/** Timing credit for a matched note: 1 inside the hit window, falling to 0 at twice the window. */
const rhythmCredit = (lateness: number, hitWindowMs: number) =>
  Math.min(1, Math.max(0, 1 - lateness / hitWindowMs))

interface TimedExpectedNote {
  note: ExpectedNote
  startMs: number
  hitWindowMs: number
}

// Pair values are whole numbers so that equal pairings compare exactly equal.
const POINTS_RESOLUTION = 1_000_000
const TIMING_STEPS = 100

/**
 * Chooses which played note goes with each expected note, so the whole performance earns the most
 * points and each played note is used at most once. Returns the played-note index for each
 * expected note, or -1 if it is unmatched. Both lists must already be sorted by start time.
 *
 * When pairings earn equal points, it prefers more matched notes, then more in-tune notes, then
 * smaller timing errors. Any remaining tie follows the sorted note order, so it is repeatable.
 *
 * This is the Hungarian algorithm over only the pairs inside the match window, which keeps the
 * work local to notes that actually compete. Each expected note also has a private zero-value
 * "stay unmatched" option, so a complete assignment always exists.
 */
function pairNotes(
  expected: TimedExpectedNote[],
  performed: PerformedNote[],
  rules: ScoringRules,
  weightSum: number,
): Int32Array {
  const rows = expected.length
  const cols = performed.length
  const tieBreakMax = TIMING_STEPS + (TIMING_STEPS + 1) + 1
  // Large enough that tie-breaks summed over every note can never outweigh one point step.
  const pointsScale = (Math.min(rows, cols) + 1) * (tieBreakMax + 1)

  const firstCol = new Int32Array(rows)
  const offsets = new Int32Array(rows + 1)
  let lo = 0
  let hi = 0
  for (let r = 0; r < rows; r++) {
    const { startMs, hitWindowMs } = expected[r]
    const matchWindowMs = hitWindowMs * 2
    while (
      lo < cols &&
      performed[lo].startMs < startMs &&
      Math.abs(performed[lo].startMs - startMs) > matchWindowMs
    ) {
      lo++
    }
    hi = Math.max(hi, lo)
    while (
      hi < cols &&
      (performed[hi].startMs <= startMs || Math.abs(performed[hi].startMs - startMs) <= matchWindowMs)
    ) {
      hi++
    }
    firstCol[r] = lo
    offsets[r + 1] = offsets[r] + (hi - lo)
  }

  // Costs are negative values, because this form of the algorithm minimizes.
  const costs = new Float64Array(offsets[rows])
  const rowPotential = new Float64Array(rows)
  for (let r = 0; r < rows; r++) {
    const { note, startMs, hitWindowMs } = expected[r]
    for (let k = offsets[r]; k < offsets[r + 1]; k++) {
      const candidate = performed[firstCol[r] + k - offsets[r]]
      const delta = Math.abs(candidate.startMs - startMs)
      const inTune =
        Math.abs(candidate.midiPitch - note.midiPitch) * 100 <= rules.pitchToleranceCents
      const points =
        ((inTune ? rules.pitchWeight : 0) +
          rules.rhythmWeight * rhythmCredit(delta - hitWindowMs, hitWindowMs) +
          rules.completenessWeight) /
        weightSum
      const timing = TIMING_STEPS - Math.round((delta / (hitWindowMs * 2)) * TIMING_STEPS)
      const tieBreak = 1 + (inTune ? TIMING_STEPS + 1 : 0) + timing
      costs[k] = -(Math.round(points * POINTS_RESOLUTION) * pointsScale + tieBreak)
      rowPotential[r] = Math.min(rowPotential[r], costs[k])
    }
  }

  // Columns 0..cols-1 are played notes; column cols + r is row r's "stay unmatched" option.
  const colPotential = new Float64Array(cols + rows)
  const rowOfCol = new Int32Array(cols + rows).fill(-1)
  const colOfRow = new Int32Array(rows).fill(-1)
  const dist = new Float64Array(cols + rows).fill(Infinity)
  const prevRow = new Int32Array(cols + rows)
  const settled = new Uint8Array(cols + rows)
  const heap: Array<[number, number]> = []

  const isBefore = (a: [number, number], b: [number, number]) =>
    a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
  const push = (item: [number, number]) => {
    let i = heap.length
    heap.push(item)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!isBefore(item, heap[parent])) break
      heap[i] = heap[parent]
      i = parent
    }
    heap[i] = item
  }
  const pop = (): [number, number] => {
    const top = heap[0]
    const last = heap.pop() as [number, number]
    const size = heap.length
    if (size > 0) {
      let i = 0
      while (true) {
        let child = 2 * i + 1
        if (child >= size) break
        if (child + 1 < size && isBefore(heap[child + 1], heap[child])) child++
        if (!isBefore(heap[child], last)) break
        heap[i] = heap[child]
        i = child
      }
      heap[i] = last
    }
    return top
  }

  for (let start = 0; start < rows; start++) {
    const touched: number[] = []
    const finished: number[] = []
    heap.length = 0

    const relax = (row: number, base: number) => {
      const visit = (col: number, cost: number) => {
        const next = base + cost - rowPotential[row] - colPotential[col]
        if (next < dist[col]) {
          if (dist[col] === Infinity) touched.push(col)
          dist[col] = next
          prevRow[col] = row
          push([next, col])
        }
      }
      for (let k = offsets[row]; k < offsets[row + 1]; k++) {
        visit(firstCol[row] + k - offsets[row], costs[k])
      }
      visit(cols + row, 0)
    }

    relax(start, 0)
    let sink = -1
    let sinkDist = 0
    while (sink === -1) {
      const [d, col] = pop()
      if (settled[col] || d > dist[col]) continue
      settled[col] = 1
      if (rowOfCol[col] === -1) {
        sink = col
        sinkDist = d
      } else {
        finished.push(col)
        relax(rowOfCol[col], d)
      }
    }

    for (const col of finished) {
      const gap = sinkDist - dist[col]
      colPotential[col] -= gap
      rowPotential[rowOfCol[col]] += gap
    }
    rowPotential[start] += sinkDist

    let col = sink
    while (true) {
      const row = prevRow[col]
      const previous = colOfRow[row]
      rowOfCol[col] = row
      colOfRow[row] = col
      if (row === start) break
      col = previous
    }

    for (const c of touched) {
      dist[c] = Infinity
      settled[c] = 0
    }
  }

  return colOfRow.map((col) => (col < cols ? col : -1))
}

export function scorePerformance(args: {
  expected: ExpectedNote[]
  tempoMap: TempoMapEntry[]
  performed: PerformedNote[]
  rules?: Partial<ScoringRules>
  speedMultiplier?: number
}): ScoreResult {
  const rules: ScoringRules = { ...DEFAULT_SCORING_RULES, ...args.rules }
  const speed = args.speedMultiplier ?? 1
  const weightSum = rules.pitchWeight + rules.rhythmWeight + rules.completenessWeight
  if (args.expected.length === 0) throw new Error('Scenario has no expected notes')
  if (args.tempoMap.length === 0) throw new Error('Scenario has no tempo map')
  if (weightSum <= 0) throw new Error('Scoring weights must sum to more than 0')

  const expected = args.expected
    .map((note) => ({
      note,
      startMs: beatToMs(note.startBeat, args.tempoMap) / speed,
      hitWindowMs: rules.hitWindowMs / speed,
    }))
    .sort(
      (a, b) =>
        a.startMs - b.startMs || a.note.midiPitch - b.note.midiPitch || a.note.index - b.note.index,
    )

  const performed = [...args.performed].sort(
    (a, b) =>
      a.startMs - b.startMs ||
      a.midiPitch - b.midiPitch ||
      a.durationMs - b.durationMs ||
      a.velocity - b.velocity,
  )
  const partners = pairNotes(expected, performed, rules, weightSum)

  let pitchTotal = 0
  let rhythmTotal = 0
  let matched = 0
  const noteResults: NoteResult[] = []

  for (let e = 0; e < expected.length; e++) {
    const { note, startMs, hitWindowMs } = expected[e]
    const best = partners[e]

    if (best === -1) {
      noteResults.push({
        expectedNoteIndex: note.index,
        verdict: 'missed',
        timingDeltaMs: 0,
        centsDeviation: 0,
      })
      continue
    }

    matched++
    const timingDeltaMs = performed[best].startMs - startMs
    const centsDeviation = (performed[best].midiPitch - note.midiPitch) * 100
    const inTune = Math.abs(centsDeviation) <= rules.pitchToleranceCents
    const lateness = Math.abs(timingDeltaMs) - hitWindowMs

    pitchTotal += inTune ? 1 : 0
    rhythmTotal += rhythmCredit(lateness, hitWindowMs)

    let verdict: HitVerdict = 'hit'
    if (!inTune) verdict = 'wrong_pitch'
    else if (lateness > 0) verdict = timingDeltaMs < 0 ? 'early' : 'late'

    noteResults.push({
      expectedNoteIndex: note.index,
      verdict,
      timingDeltaMs: round2(timingDeltaMs),
      centsDeviation: round2(centsDeviation),
    })
  }

  noteResults.sort((a, b) => a.expectedNoteIndex - b.expectedNoteIndex)

  const n = expected.length
  const pitch = (pitchTotal / n) * 100
  const rhythm = (rhythmTotal / n) * 100
  const completeness = (matched / n) * 100
  const finalScore =
    (pitch * rules.pitchWeight +
      rhythm * rules.rhythmWeight +
      completeness * rules.completenessWeight) /
    weightSum

  return {
    finalScore: Math.round((finalScore / 100) * MAX_SCORE),
    breakdown: {
      pitchAccuracy: round2(pitch),
      rhythmAccuracy: round2(rhythm),
      completeness: round2(completeness),
      notesHit: noteResults.filter((r) => r.verdict === 'hit').length,
      notesMissed: n - matched,
      extraNotes: performed.length - matched,
      noteResults,
    },
  }
}
