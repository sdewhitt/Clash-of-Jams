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
  /** 0-100, two decimal places. */
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

/** The tempo in effect at a beat. tempoMap must be sorted and start at beat 0. */
export function bpmAt(beat: number, tempoMap: TempoMapEntry[]): number {
  let bpm = tempoMap[0].bpm
  for (const entry of tempoMap) {
    if (entry.atBeat > beat) break
    bpm = entry.bpm
  }
  return bpm
}

const round2 = (x: number) => Math.round(x * 100) / 100

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
      hitWindowMs: (rules.hitWindowBeats * 60000) / (bpmAt(note.startBeat, args.tempoMap) * speed),
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
  const used = new Array<boolean>(performed.length).fill(false)

  let pitchTotal = 0
  let rhythmTotal = 0
  let matched = 0
  const noteResults: NoteResult[] = []

  for (const { note, startMs, hitWindowMs } of expected) {
    const matchWindowMs = hitWindowMs * 2
    // Prefer an in-tune candidate, then the closest onset, then the earliest.
    let best = -1
    let bestKey: [number, number] = [Infinity, Infinity]
    for (let i = 0; i < performed.length; i++) {
      if (used[i]) continue
      const delta = Math.abs(performed[i].startMs - startMs)
      if (delta > matchWindowMs) continue
      const cents = Math.abs(performed[i].midiPitch - note.midiPitch) * 100
      const key: [number, number] = [cents <= rules.pitchToleranceCents ? 0 : 1, delta]
      if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
        best = i
        bestKey = key
      }
    }

    if (best === -1) {
      noteResults.push({
        expectedNoteIndex: note.index,
        verdict: 'missed',
        timingDeltaMs: 0,
        centsDeviation: 0,
      })
      continue
    }

    used[best] = true
    matched++
    const timingDeltaMs = performed[best].startMs - startMs
    const centsDeviation = (performed[best].midiPitch - note.midiPitch) * 100
    const inTune = Math.abs(centsDeviation) <= rules.pitchToleranceCents
    const lateness = Math.abs(timingDeltaMs) - hitWindowMs

    pitchTotal += inTune ? 1 : 0
    rhythmTotal += Math.min(1, Math.max(0, 1 - lateness / hitWindowMs))

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
    finalScore: round2(finalScore),
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
