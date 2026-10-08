/** Timeline construction and scoring-rule resolution for a run. */
import { describe, expect, it } from 'vitest'

import { buildTimeline, resolveScoringRules } from '@/lib/play/timeline'
import { DEFAULT_SCORING_RULES } from '@/lib/schema/collections'
import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'

const note = (index: number, startBeat: number, durationBeats = 1): ExpectedNote => ({
  index,
  midiPitch: 60 + index,
  startBeat,
  durationBeats,
  velocity: 96,
})

const tempo = (atBeat: number, bpm: number, timeSigNum = 4): TempoMapEntry => ({
  atBeat,
  bpm,
  timeSigNum,
  timeSigDen: 4,
})

describe('buildTimeline', () => {
  it('places notes in milliseconds and ends when the last note lets go', () => {
    const timeline = buildTimeline({
      notes: [note(0, 0), note(1, 2, 2)],
      tempoMap: [tempo(0, 120)],
    })

    expect(timeline.notes.map((n) => [n.startMs, n.endMs])).toEqual([
      [0, 500],
      [1000, 2000],
    ])
    expect(timeline.endMs).toBe(2000)
  })

  it('counts in one bar before beat 0, accenting its first click', () => {
    const timeline = buildTimeline({ notes: [note(0, 0)], tempoMap: [tempo(0, 120, 3)] })

    expect(timeline.countInBeats).toBe(3)
    expect(timeline.clicks.filter((click) => click.ms < 0)).toEqual([
      { ms: -1500, accent: true },
      { ms: -1000, accent: false },
      { ms: -500, accent: false },
    ])
  })

  it('clicks every beat of the chart and accents each bar line', () => {
    const timeline = buildTimeline({ notes: [note(0, 0, 6)], tempoMap: [tempo(0, 60)] })
    const inChart = timeline.clicks.filter((click) => click.ms >= 0)

    expect(inChart.map((click) => click.ms)).toEqual([0, 1000, 2000, 3000, 4000, 5000])
    expect(inChart.map((click) => click.accent)).toEqual([true, false, false, false, true, false])
  })

  it('stretches everything, count-in included, at a slower speed', () => {
    const timeline = buildTimeline({
      notes: [note(0, 1)],
      tempoMap: [tempo(0, 120)],
      speedMultiplier: 0.5,
    })

    expect(timeline.notes[0].startMs).toBe(1000)
    expect(timeline.countInBeatMs).toBe(1000)
    expect(timeline.clicks[0].ms).toBe(-4000)
  })

  it('follows a tempo change, whatever order the map is stored in', () => {
    const timeline = buildTimeline({
      notes: [note(0, 0), note(1, 3)],
      tempoMap: [tempo(2, 60), tempo(0, 120)],
    })

    // Two beats at 120 (1000 ms), then one beat at 60 (1000 ms).
    expect(timeline.notes[1].startMs).toBe(2000)
    expect(timeline.tempoMap.map((entry) => entry.atBeat)).toEqual([0, 2])
  })
})

describe('resolveScoringRules', () => {
  it('fills in defaults and drops fields the schema no longer has', () => {
    const legacy = { pitchWeight: 0.5, hitWindowBeats: 0.25 } as never

    expect(resolveScoringRules(legacy)).toEqual({ ...DEFAULT_SCORING_RULES, pitchWeight: 0.5 })
  })
})
