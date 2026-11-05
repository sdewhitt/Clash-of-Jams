/**
 * The tuner's arithmetic: which note a pitch is nearest, how many cents away it is, and a
 * smoother that keeps the display steady while a note rings.
 *
 * Pitch arrives either as hertz or as fractional MIDI from the audio analyzer (which assumes
 * A4 = 440 Hz). Readings are against a reference A4 the player can change.
 */
import { pitchName } from '@/lib/chart/notes'

export const DEFAULT_A4_HZ = 440
export const MIN_A4_HZ = 415
export const MAX_A4_HZ = 466
/** Within this many cents of the target, the note reads as in tune. */
export const IN_TUNE_CENTS = 5
/** The needle's range either side of the target. */
export const NEEDLE_RANGE_CENTS = 50

export type TuningStatus = 'flat' | 'in_tune' | 'sharp'

export interface TunerReading {
  /** The pitch heard. */
  hz: number
  /** The nearest note, as MIDI against the reference A4. */
  targetMidi: number
  /** "A4", "C#3". */
  noteName: string
  /** The nearest note's frequency against the reference A4. */
  targetHz: number
  /** Distance from the nearest note, -50 to +50. Positive is sharp. */
  cents: number
  status: TuningStatus
}

export function clampA4(hz: number): number {
  if (!Number.isFinite(hz)) return DEFAULT_A4_HZ
  return Math.min(MAX_A4_HZ, Math.max(MIN_A4_HZ, Math.round(hz)))
}

export function tuningStatus(cents: number): TuningStatus {
  if (Math.abs(cents) <= IN_TUNE_CENTS) return 'in_tune'
  return cents < 0 ? 'flat' : 'sharp'
}

/** The reading for a frequency, or null for nothing usable (not positive, or outside MIDI). */
export function readHz(hz: number, a4Hz = DEFAULT_A4_HZ): TunerReading | null {
  if (!Number.isFinite(hz) || hz <= 0) return null
  const midi = 69 + 12 * Math.log2(hz / a4Hz)
  const targetMidi = Math.round(midi)
  if (targetMidi < 0 || targetMidi > 127) return null
  const cents = Math.round((midi - targetMidi) * 1000) / 10
  return {
    hz,
    targetMidi,
    noteName: pitchName(targetMidi),
    targetHz: a4Hz * 2 ** ((targetMidi - 69) / 12),
    cents,
    status: tuningStatus(cents),
  }
}

/** The reading for fractional MIDI as the analyzer reports it, against A4 = 440 Hz. */
export function readMidi(midi: number, a4Hz = DEFAULT_A4_HZ): TunerReading | null {
  if (!Number.isFinite(midi)) return null
  return readHz(440 * 2 ** ((midi - 69) / 12), a4Hz)
}

/** The needle's position across the dial, 0 (50 cents flat) to 100 (50 cents sharp). */
export function needlePercent(cents: number): number {
  const clamped = Math.min(NEEDLE_RANGE_CENTS, Math.max(-NEEDLE_RANGE_CENTS, cents))
  return 50 + (clamped / NEEDLE_RANGE_CENTS) * 50
}

export function formatCents(cents: number): string {
  const rounded = Math.round(cents)
  if (rounded === 0) return '0 cents'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)} cents`
}

export interface SmootherOptions {
  /** Frames of pitch the median is taken over. */
  windowFrames: number
  /** Analyzer clarity below which a frame is ignored. */
  minClarity: number
  /** How long the last reading stays up after the note stops, in ms. */
  holdMs: number
}

const DEFAULT_SMOOTHER: SmootherOptions = { windowFrames: 7, minClarity: 0.85, holdMs: 600 }

/**
 * Turns a stream of analyzer frames into a steady pitch: the median of the last few clear
 * frames, restarted whenever the note changes, and held briefly after it stops.
 */
export class PitchSmoother {
  private readonly options: SmootherOptions
  private recent: number[] = []
  private lastMidi: number | null = null
  private lastClearMs = -Infinity

  constructor(options: Partial<SmootherOptions> = {}) {
    this.options = { ...DEFAULT_SMOOTHER, ...options }
  }

  /** `midi` is fractional MIDI or null; returns the pitch to show, or null for none. */
  push(midi: number | null, clarity: number, nowMs: number): number | null {
    const clear = midi !== null && Number.isFinite(midi) && clarity >= this.options.minClarity
    if (clear) {
      // A jump of more than half a semitone is a new note, not drift.
      const previous = this.recent.at(-1)
      if (previous !== undefined && Math.abs(midi - previous) > 0.5) this.recent = []
      this.recent.push(midi)
      if (this.recent.length > this.options.windowFrames) this.recent.shift()
      this.lastClearMs = nowMs
      const sorted = [...this.recent].sort((a, b) => a - b)
      const mid = sorted.length >> 1
      this.lastMidi = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
      return this.lastMidi
    }
    if (nowMs - this.lastClearMs > this.options.holdMs) {
      this.recent = []
      this.lastMidi = null
    }
    return this.lastMidi
  }

  reset(): void {
    this.recent = []
    this.lastMidi = null
    this.lastClearMs = -Infinity
  }
}
