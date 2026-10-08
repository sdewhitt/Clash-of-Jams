import { PitchDetector } from 'pitchy'

/** One analysis step over the most recent window of input. */
export interface AudioFrame {
  /** AudioContext time, in seconds, at the centre of the level window. */
  time: number
  /** RMS level of the level window, in dBFS. */
  db: number
  /** Fractional MIDI pitch (60.25 is C4 plus 25 cents), or null when no pitch was found. */
  midi: number | null
  /** McLeod clarity, 0-1. */
  clarity: number
}

export interface AnalyzerOptions {
  /** Samples used for pitch detection. Must hold two periods of the lowest note. */
  windowSize: number
  /** Samples between frames; sets the timing resolution. */
  hopSize: number
  /** Trailing samples used for level, kept short so onsets stay sharp. */
  levelWindowSize: number
  minHz: number
  maxHz: number
}

export const DEFAULT_ANALYZER_OPTIONS: AnalyzerOptions = {
  windowSize: 2048,
  hopSize: 256,
  levelWindowSize: 512,
  minHz: 40,
  maxHz: 2000,
}

const SILENCE_DB = -120

export function rmsToDb(rms: number): number {
  return rms > 0 ? Math.max(SILENCE_DB, 20 * Math.log10(rms)) : SILENCE_DB
}

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440)
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Scientific pitch name of the nearest semitone: 60 is C4. */
export function midiToNoteName(midi: number): string {
  const n = Math.round(midi)
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`
}

/** Maps a peak level onto MIDI velocity 1-127, linearly in decibels. */
export function dbToVelocity(db: number, floorDb: number, ceilingDb: number): number {
  const t = Math.min(1, Math.max(0, (db - floorDb) / (ceilingDb - floorDb)))
  return Math.round(1 + t * 126)
}

/** Turns a stream of sample chunks into overlapping frames of level and pitch. */
export class FrameAnalyzer {
  readonly options: AnalyzerOptions
  /** How far, in ms, a frame's pitch estimate trails its level (window centres differ). */
  readonly pitchLagMs: number

  private readonly ring: Float32Array
  private readonly window: Float32Array
  private readonly detector: PitchDetector<Float32Array>
  private writeIndex = 0
  private sinceHop = 0

  readonly sampleRate: number

  constructor(sampleRate: number, options: Partial<AnalyzerOptions> = {}) {
    this.sampleRate = sampleRate
    this.options = { ...DEFAULT_ANALYZER_OPTIONS, ...options }
    const { windowSize, levelWindowSize } = this.options
    if (levelWindowSize > windowSize) throw new Error('levelWindowSize must not exceed windowSize')
    this.ring = new Float32Array(windowSize)
    this.window = new Float32Array(windowSize)
    this.detector = PitchDetector.forFloat32Array(windowSize)
    this.pitchLagMs = (((windowSize - levelWindowSize) / 2) * 1000) / sampleRate
  }

  /** `time` is the AudioContext time of `samples[0]`. */
  push(samples: Float32Array, time: number): AudioFrame[] {
    const { windowSize, hopSize } = this.options
    const frames: AudioFrame[] = []
    for (let i = 0; i < samples.length; i++) {
      this.ring[this.writeIndex] = samples[i]
      this.writeIndex = (this.writeIndex + 1) % windowSize
      if (++this.sinceHop === hopSize) {
        this.sinceHop = 0
        frames.push(this.analyze(time + (i + 1) / this.sampleRate))
      }
    }
    return frames
  }

  private analyze(endTime: number): AudioFrame {
    const { windowSize, levelWindowSize, minHz, maxHz } = this.options
    this.window.set(this.ring.subarray(this.writeIndex))
    this.window.set(this.ring.subarray(0, this.writeIndex), windowSize - this.writeIndex)

    let sumSquares = 0
    for (let i = windowSize - levelWindowSize; i < windowSize; i++) {
      sumSquares += this.window[i] * this.window[i]
    }
    const db = rmsToDb(Math.sqrt(sumSquares / levelWindowSize))

    const [hz, clarity] = this.detector.findPitch(this.window, this.sampleRate)
    const inRange = clarity > 0 && hz >= minHz && hz <= maxHz
    return {
      time: endTime - levelWindowSize / 2 / this.sampleRate,
      db,
      midi: inRange ? hzToMidi(hz) : null,
      clarity: inRange ? clarity : 0,
    }
  }
}
