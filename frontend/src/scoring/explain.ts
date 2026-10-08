import { pitchName } from '@/lib/chart/notes'
import { DEFAULT_SCORING_RULES } from '@/lib/schema/collections'
import type { ExpectedNote, NoteResult, ScoringRules } from '@/lib/schema/types'

import { MAX_SCORE, type ScoreResult } from './score'

export interface CategoryExplanation {
  label: 'Pitch' | 'Rhythm' | 'Completeness'
  score: number
  /** This category's share of the final score, 0-100. */
  weightPercent: number
  detail: string
}

export interface ScoreExplanation {
  summary: string
  categories: CategoryExplanation[]
  /** One sentence per note that was not a clean hit, in scenario order. */
  noteProblems: string[]
}

function describeNote(result: NoteResult, expected: ExpectedNote[]): string {
  const note = expected.find((n) => n.index === result.expectedNoteIndex)
  const name = note ? pitchName(note.midiPitch) : '?'
  return `Note ${result.expectedNoteIndex + 1} (${name})`
}

function describeProblem(
  result: NoteResult,
  expected: ExpectedNote[],
  hitWindowMs: number,
): string | null {
  const note = describeNote(result, expected)
  const ms = Math.round(Math.abs(result.timingDeltaMs))
  const cents = Math.round(Math.abs(result.centsDeviation))
  const direction = result.centsDeviation > 0 ? 'sharp (too high)' : 'flat (too low)'

  if (result.verdict === 'missed') return `${note} was missed.`
  if (result.verdict === 'early') return `${note} was ${ms} ms early.`
  if (result.verdict === 'late') return `${note} was ${ms} ms late.`
  if (result.verdict === 'wrong_pitch') {
    const timing =
      ms > hitWindowMs ? `, and ${ms} ms ${result.timingDeltaMs < 0 ? 'early' : 'late'}` : ''
    return `${note} was ${cents} cents ${direction}${timing}.`
  }
  return null
}

function summarize(finalScore: number, categories: CategoryExplanation[]): string {
  let rating = 'Keep practicing!'
  if (finalScore >= 0.9 * MAX_SCORE) rating = 'Excellent!'
  else if (finalScore >= 0.75 * MAX_SCORE) rating = 'Good job!'
  else if (finalScore >= 0.5 * MAX_SCORE) rating = 'Getting there!'

  if (finalScore === MAX_SCORE) return `${rating} A perfect performance.`

  let weakest = categories[0]
  for (const category of categories) {
    if (category.score < weakest.score) weakest = category
  }
  return `${rating} Your score is ${finalScore.toLocaleString()} out of ${MAX_SCORE.toLocaleString()}. Focus on ${weakest.label.toLowerCase()} to improve the most.`
}

/** Turns a score into plain sentences for the results screen. */
export function explainScore(args: {
  result: ScoreResult
  expected: ExpectedNote[]
  rules?: Partial<ScoringRules>
  speedMultiplier?: number
}): ScoreExplanation {
  const { result, expected } = args
  const rules: ScoringRules = { ...DEFAULT_SCORING_RULES, ...args.rules }
  const hitWindowMs = rules.hitWindowMs / (args.speedMultiplier ?? 1)
  const breakdown = result.breakdown
  const total = breakdown.noteResults.length
  const weightSum = rules.pitchWeight + rules.rhythmWeight + rules.completenessWeight

  let played = 0
  let inTune = 0
  let onTime = 0
  for (const noteResult of breakdown.noteResults) {
    if (noteResult.verdict === 'missed') continue
    played++
    if (noteResult.verdict !== 'wrong_pitch') inTune++
    if (Math.abs(noteResult.timingDeltaMs) <= hitWindowMs) onTime++
  }

  let completenessDetail = `You played ${played} of ${total} notes.`
  if (breakdown.extraNotes === 1) completenessDetail += ' You also played 1 extra note.'
  if (breakdown.extraNotes > 1) {
    completenessDetail += ` You also played ${breakdown.extraNotes} extra notes.`
  }

  const categories: CategoryExplanation[] = [
    {
      label: 'Pitch',
      score: breakdown.pitchAccuracy,
      weightPercent: Math.round((rules.pitchWeight / weightSum) * 100),
      detail: `${inTune} of ${total} notes were in tune (within ${rules.pitchToleranceCents} cents).`,
    },
    {
      label: 'Rhythm',
      score: breakdown.rhythmAccuracy,
      weightPercent: Math.round((rules.rhythmWeight / weightSum) * 100),
      detail: `${onTime} of ${total} notes were on time (within ${Math.round(hitWindowMs)} ms).`,
    },
    {
      label: 'Completeness',
      score: breakdown.completeness,
      weightPercent: Math.round((rules.completenessWeight / weightSum) * 100),
      detail: completenessDetail,
    },
  ]

  const noteProblems: string[] = []
  for (const noteResult of breakdown.noteResults) {
    const problem = describeProblem(noteResult, expected, hitWindowMs)
    if (problem) noteProblems.push(problem)
  }

  return { summary: summarize(result.finalScore, categories), categories, noteProblems }
}
