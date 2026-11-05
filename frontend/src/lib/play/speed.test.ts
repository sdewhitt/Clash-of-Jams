/**
 * Speed adjustment (story #19): the allowed range, the tempo it gives, and that a performance
 * scaled to the speed scores exactly what it would at full speed.
 */
import { describe, expect, it } from 'vitest'

import { toPerformedNotes } from '@/audio/performance'
import {
  RECORDING_SAMPLE_RATE,
  recordingAnswerKey,
  renderRecording,
  TEST_RECORDINGS,
} from '@/audio/recordings'
import {
  clampSpeed,
  DEFAULT_SPEED,
  describeTempo,
  formatSpeed,
  MAX_SPEED,
  MIN_SPEED,
  playedBpm,
} from '@/lib/play/speed'
import { buildTimeline } from '@/lib/play/timeline'
import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'
import { transcribe } from '@/audio/transcribe'
import { scorePerformance, type PerformedNote } from '@/scoring/score'
import { PLAYBACK_SCENARIOS } from '@/test/playback-scenarios'

const tempoMap: TempoMapEntry[] = [{ atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 }]

describe('speed range', () => {
  it('starts at 1x, which keeps the written tempo', () => {
    expect(DEFAULT_SPEED).toBe(1)
    expect(playedBpm(tempoMap, DEFAULT_SPEED)).toBe(120)
    expect(describeTempo(tempoMap, DEFAULT_SPEED)).toBe('1x · 120 bpm')
  })

  it('allows 0.3x to 3x and clamps anything outside', () => {
    expect(MIN_SPEED).toBe(0.3)
    expect(MAX_SPEED).toBe(3)
    expect(clampSpeed(0.1)).toBe(0.3)
    expect(clampSpeed(5)).toBe(3)
    expect(clampSpeed(0.756)).toBe(0.76)
    expect(clampSpeed(Number.NaN)).toBe(1)
  })

  it('describes the speed and the tempo it gives', () => {
    expect(formatSpeed(0.5)).toBe('0.5x')
    expect(formatSpeed(1.25)).toBe('1.25x')
    expect(describeTempo(tempoMap, 0.5)).toBe('0.5x · 60 bpm (written 120 bpm)')
    expect(describeTempo(tempoMap, 3)).toBe('3x · 360 bpm (written 120 bpm)')
  })
})

describe('tempo follows the multiplier by the advertised ratio', () => {
  /** What a tap-tempo (BPM tapper) would read from the metronome clicks: 60000 / mean interval. */
  function tappedBpm(clickMs: number[]): number {
    const intervals = clickMs.slice(1).map((ms, i) => ms - clickMs[i])
    return 60000 / (intervals.reduce((a, b) => a + b, 0) / intervals.length)
  }

  const notes: ExpectedNote[] = Array.from({ length: 16 }, (_, index) => ({
    index,
    midiPitch: 60,
    startBeat: index,
    durationBeats: 1,
    velocity: 96,
  }))

  it.each([0.3, 0.5, 0.75, 1, 1.5, 2, 3])('%sx', (speed) => {
    const timeline = buildTimeline({ notes, tempoMap, speedMultiplier: speed })
    const inChart = timeline.clicks.filter((click) => click.ms >= 0).map((click) => click.ms)
    const countIn = timeline.clicks.filter((click) => click.ms < 0).map((click) => click.ms)

    expect(tappedBpm(inChart)).toBeCloseTo(120 * speed, 6)
    expect(tappedBpm(countIn)).toBeCloseTo(120 * speed, 6)
    expect(timeline.endMs).toBeCloseTo(8000 / speed, 6)
  })
})

describe('score is the same at every speed', () => {
  /** A performance of the chart at the given speed, with fixed real-time timing errors. */
  function perform(notes: ExpectedNote[], map: TempoMapEntry[], speed: number): PerformedNote[] {
    const timeline = buildTimeline({ notes, tempoMap: map, speedMultiplier: speed })
    return timeline.notes.map(({ note, startMs, endMs }, i) => ({
      // Timing errors scale with the speed, as a player keeping the same feel would make them.
      midiPitch: note.midiPitch + (i % 5 === 0 ? 0.3 : 0),
      startMs: startMs + ((i % 3) - 1) * (90 / speed),
      durationMs: endMs - startMs,
      velocity: note.velocity,
    }))
  }

  it.each(PLAYBACK_SCENARIOS.slice(0, 20).map((s) => [s.name, s] as const))('%s', (_, scenario) => {
    const baseline = scorePerformance({
      expected: scenario.notes,
      tempoMap: scenario.tempoMap,
      performed: perform(scenario.notes, scenario.tempoMap, 1),
    })
    for (const speed of [0.3, 0.5, 2, 3]) {
      const result = scorePerformance({
        expected: scenario.notes,
        tempoMap: scenario.tempoMap,
        performed: perform(scenario.notes, scenario.tempoMap, speed),
        speedMultiplier: speed,
      })
      expect(result.finalScore).toBe(baseline.finalScore)
      expect(result.breakdown.noteResults.map((r) => r.verdict)).toEqual(
        baseline.breakdown.noteResults.map((r) => r.verdict),
      )
    }
  })

  it.each(['single-pitches', 'rhythm', 'slow-scale', 'legato-melody'])(
    'recorded audio slowed or sped up scores the same: %s',
    (id) => {
      const recording = TEST_RECORDINGS.find((candidate) => candidate.id === id)!
      const key = recordingAnswerKey(recording)
      const scores = [0.5, 1, 2].map((speed) => {
        // The same take, played at `speed` times the written tempo.
        const scaled = {
          ...recording,
          bpm: recording.bpm * speed,
          seconds: recording.leadInSeconds + (recording.seconds - recording.leadInSeconds) / speed,
        }
        const detected = transcribe(renderRecording(scaled), RECORDING_SAMPLE_RATE)
        const performed = toPerformedNotes(detected, recording.leadInSeconds)
        return scorePerformance({ ...key, performed, speedMultiplier: speed }).finalScore
      })
      expect(new Set(scores).size).toBe(1)
    },
    60_000,
  )
})
