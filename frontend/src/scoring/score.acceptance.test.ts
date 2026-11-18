/**
 * Measures the User Story 76 acceptance criteria against the scoring engine.
 * Inputs are synthetic and come from a seeded generator, so every run sees the same notes.
 */
import { describe, expect, it } from 'vitest'

import { DEFAULT_SCORING_RULES } from '@/lib/schema/collections'
import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'

import { MAX_SCORE, scorePerformance, type PerformedNote } from './score'

// 60 bpm, so one beat is exactly 1000 ms.
const tempoMap: TempoMapEntry[] = [{ atBeat: 0, bpm: 60, timeSigNum: 4, timeSigDen: 4 }]
const rules = DEFAULT_SCORING_RULES

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const expectedAt = (startMs: number, midiPitch: number, index: number): ExpectedNote => ({
  index,
  midiPitch,
  startBeat: startMs / 1000,
  durationBeats: 0.25,
  velocity: 100,
})

const played = (midiPitch: number, startMs: number): PerformedNote => ({
  midiPitch,
  startMs,
  durationMs: 100,
  velocity: 100,
})

const run = (expected: ExpectedNote[], performed: PerformedNote[]) =>
  scorePerformance({ expected, tempoMap, performed, rules })

/** Random expected notes plus an imperfect performance of them. */
function song(random: () => number, count: number, spacingMs: number) {
  const expected = Array.from({ length: count }, (_, i) =>
    expectedAt(1000 + i * spacingMs, 60 + Math.floor(random() * 12), i),
  )
  const performed = expected
    .filter(() => random() > 0.05)
    .map((note) =>
      played(
        note.midiPitch + (random() < 0.05 ? 1 : 0),
        note.startBeat * 1000 + (random() - 0.5) * 200,
      ),
    )
  return { expected, performed }
}

/** Highest score any valid assignment can reach, by trying all of them. Small inputs only. */
function bestPossibleScore(expected: ExpectedNote[], performed: PerformedNote[]) {
  const window = rules.hitWindowMs
  const weightSum = rules.pitchWeight + rules.rhythmWeight + rules.completenessWeight
  const n = expected.length
  let best = 0
  const walk = (i: number, used: Set<number>, pitch: number, rhythm: number, hit: number) => {
    if (i === n) {
      const total =
        ((pitch / n) * rules.pitchWeight +
          (rhythm / n) * rules.rhythmWeight +
          (hit / n) * rules.completenessWeight) /
        weightSum
      best = Math.max(best, Math.round(total * MAX_SCORE))
      return
    }
    walk(i + 1, used, pitch, rhythm, hit)
    performed.forEach((note, j) => {
      if (used.has(j)) return
      const delta = Math.abs(note.startMs - expected[i].startBeat * 1000)
      if (delta > window * 2) return
      const cents = Math.abs(note.midiPitch - expected[i].midiPitch) * 100
      const credit = Math.min(1, Math.max(0, 1 - (delta - window) / window))
      used.add(j)
      walk(i + 1, used, pitch + (cents <= rules.pitchToleranceCents ? 1 : 0), rhythm + credit, hit + 1)
      used.delete(j)
    })
  }
  walk(0, new Set(), 0, 0, 0)
  return best
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.ceil((p / 100) * sorted.length) - 1]
}

describe('US76: identical and similar notes', () => {
  it('gives identical results for identical notes in any input order', () => {
    const random = rng(1)
    for (let i = 0; i < 200; i++) {
      const { expected, performed } = song(random, 50, 100)
      const first = run(expected, performed)
      const shuffled = [...performed].sort(() => random() - 0.5)
      expect(run(expected, performed)).toEqual(first)
      expect(run(expected, shuffled)).toEqual(first)
    }
  })

  it.each([
    ['normal spacing', 500],
    ['dense spacing', 100],
  ])('reports score movement from a 1 ms timing nudge (%s)', (label, spacing) => {
    const random = rng(2)
    const changes: number[] = []
    for (let i = 0; i < 500; i++) {
      const { expected, performed } = song(random, 20, spacing)
      const nudged = performed.map((n) => ({ ...n, startMs: n.startMs + (random() < 0.5 ? -1 : 1) }))
      changes.push(Math.abs(run(expected, performed).finalScore - run(expected, nudged).finalScore))
    }
    console.log(
      `[US76 similar] ${label}: median ${percentile(changes, 50)}, ` +
        `p95 ${percentile(changes, 95)}, max ${Math.max(...changes)} of ${MAX_SCORE}`,
    )
    // "Highly similar" has no number in the story; 1% of the scale is this test's assumption.
    expect(Math.max(...changes)).toBeLessThanOrEqual(MAX_SCORE * 0.01)
  })
})

describe('US76: ambiguous matches and ties', () => {
  it('gives the highest score on the worked example', () => {
    const expected = [expectedAt(1000, 60, 0), expectedAt(1100, 60, 1)]
    const performed = [played(60, 900), played(60, 1060)]
    expect(bestPossibleScore(expected, performed)).toBe(MAX_SCORE)
    expect(run(expected, performed).finalScore).toBe(MAX_SCORE)
  })

  it('uses each played note at most once', () => {
    const random = rng(6)
    for (let i = 0; i < 200; i++) {
      const { expected, performed } = song(random, 30, 50)
      const { breakdown } = run(expected, performed)
      const matched = expected.length - breakdown.notesMissed
      expect(matched).toBeLessThanOrEqual(performed.length)
      expect(breakdown.extraNotes).toBe(performed.length - matched)
    }
  })

  it('resolves exact ties the same way in any input order', () => {
    const expected = [expectedAt(1000, 60, 0), expectedAt(1000, 60, 1), expectedAt(1100, 60, 2)]
    const performed = [played(60, 950), played(60, 1050), played(60, 1050), played(60, 1150)]
    const first = run(expected, performed)
    expect(run(expected, [...performed].reverse())).toEqual(first)
    expect(first.finalScore).toBe(MAX_SCORE)
    expect(first.breakdown.extraNotes).toBe(1)
  })

  it.each([
    ['normal spacing', 500],
    ['dense spacing', 100],
  ])('matches brute force on random small performances (%s)', (label, spacing) => {
    const random = rng(3)
    const trials = 2000
    let below = 0
    let worst = 0
    for (let i = 0; i < trials; i++) {
      const expected = Array.from({ length: 5 }, (_, k) =>
        expectedAt(1000 + k * spacing, 60 + Math.floor(random() * 2), k),
      )
      const performed = expected.map((n) =>
        played(60 + Math.floor(random() * 2), n.startBeat * 1000 + (random() - 0.5) * 300),
      )
      const gap = bestPossibleScore(expected, performed) - run(expected, performed).finalScore
      // One point of slack: pair values are compared at finite precision, then rounded.
      if (gap > 1) below++
      worst = Math.max(worst, gap)
    }
    console.log(
      `[US76 ambiguous] ${label}: ${below}/${trials} below best possible, largest gap ${worst}`,
    )
    expect(below).toBe(0)
  })
})

describe('US76: real-time score', () => {
  // The same steps ScenarioPlayer runs on each render while playing.
  const liveScore = (expected: ExpectedNote[], performed: PerformedNote[], elapsedMs: number) => {
    const judged = expected.filter((n) => n.startBeat * 1000 < elapsedMs - rules.hitWindowMs * 2)
    return judged.length ? run(judged, performed).finalScore : null
  }

  it('updates as notes are judged and ends on the final score', () => {
    const expected = Array.from({ length: 8 }, (_, i) => expectedAt(1000 + i * 500, 60, i))
    const performed = expected.map((n) => played(60, n.startBeat * 1000))
    const seen: Array<number | null> = []
    for (let elapsed = 0; elapsed <= 6000; elapsed += 16) {
      seen.push(
        liveScore(
          expected,
          performed.filter((n) => n.startMs <= elapsed),
          elapsed,
        ),
      )
    }
    expect(seen[0]).toBeNull()
    expect(seen.filter((s) => s !== null).every((s) => s === MAX_SCORE)).toBe(true)

    // Only half played, so the score should fall once the unplayed notes are judged.
    const half = performed.slice(0, 4)
    const atHalf = liveScore(expected, half, 2900)
    const atEnd = liveScore(expected, half, 6000)
    expect(atHalf).toBe(MAX_SCORE)
    expect(atEnd).toBe(run(expected, half).finalScore)
    expect(atEnd).toBeLessThan(MAX_SCORE)
  })

  it('reports the cost of one live update against a 60 fps frame', () => {
    const { expected, performed } = song(rng(4), 1999, 250)
    const times: number[] = []
    for (let i = 0; i < 100; i++) {
      const start = performance.now()
      run(expected, performed)
      times.push(performance.now() - start)
    }
    console.log(
      `[US76 live] 1999 notes: p50 ${percentile(times, 50).toFixed(2)} ms, ` +
        `p95 ${percentile(times, 95).toFixed(2)} ms (frame budget 16.67 ms)`,
    )
    expect(percentile(times, 95)).toBeLessThan(16.67)
  })
})

describe('US76: scoring speed', () => {
  it.each([
    ['typical song', 250],
    // 100 notes per second. Far denser input (800+ notes inside one 480 ms window) exceeds 100 ms.
    ['extremely fast run, 10 ms apart', 10],
  ])(
    'scores 1999 by 1999 notes in under 100 ms for over 95%% of runs (%s)',
    (label, spacing) => {
      const { expected, performed } = song(rng(5), 1999, spacing)
      const padded = [...performed]
      while (padded.length < 1999) padded.push(played(60, 1000 + padded.length * spacing))
      const times: number[] = []
      for (let i = 0; i < 200; i++) {
        const start = performance.now()
        run(expected, padded)
        times.push(performance.now() - start)
      }
      const under = times.filter((t) => t < 100).length / times.length
      console.log(
        `[US76 speed] ${label}: p50 ${percentile(times, 50).toFixed(2)} ms, ` +
          `p95 ${percentile(times, 95).toFixed(2)} ms, ${(under * 100).toFixed(1)}% under 100 ms`,
      )
      expect(under).toBeGreaterThan(0.95)
    },
    120_000,
  )
})
