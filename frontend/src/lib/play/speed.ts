/**
 * The speed multiplier a scenario is played (or heard) at.
 *
 * Charts store onsets in beats, so speed is applied on the way to the clock: buildTimeline and
 * scorePerformance both divide milliseconds by it. A take played at half speed with every note
 * twice as far apart therefore scores exactly what the full-speed take would.
 */
import type { TempoMapEntry } from '@/lib/schema/types'

export const MIN_SPEED = 0.3
export const MAX_SPEED = 3
export const DEFAULT_SPEED = 1
/** Granularity of the speed slider. */
export const SPEED_STEP = 0.05
/** Shortcuts offered next to the slider. */
export const SPEED_PRESETS = [0.5, 0.75, 1, 1.5, 2] as const

/** Clamps to the allowed range and rounds to two decimals, so stored values stay tidy. */
export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return DEFAULT_SPEED
  const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed))
  return Math.round(clamped * 100) / 100
}

/** "0.75x", "1x", "2.5x". */
export function formatSpeed(speed: number): string {
  return `${Number(speed.toFixed(2))}x`
}

/** The opening tempo as heard at this speed, rounded to a whole bpm for display. */
export function playedBpm(tempoMap: TempoMapEntry[], speed: number): number {
  const opening = [...tempoMap].sort((a, b) => a.atBeat - b.atBeat)[0]
  return Math.round((opening?.bpm ?? 0) * speed)
}

/** "0.5x · 60 bpm (written 120 bpm)", or "1x · 120 bpm" when nothing changed. */
export function describeTempo(tempoMap: TempoMapEntry[], speed: number): string {
  const played = playedBpm(tempoMap, speed)
  const written = playedBpm(tempoMap, 1)
  const base = `${formatSpeed(speed)} · ${played} bpm`
  return played === written ? base : `${base} (written ${written} bpm)`
}
