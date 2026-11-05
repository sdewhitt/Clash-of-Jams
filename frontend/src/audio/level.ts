/**
 * Input level metering, so a player can set the gain on their audio interface: loud enough to
 * be heard clearly, never so loud that it clips.
 */
import { rmsToDb } from './analysis'

export interface InputLevel {
  /** RMS level of the block, in dBFS. */
  rmsDb: number
  /** Loudest sample of the block, in dBFS. */
  peakDb: number
  /** Whether any sample reached full scale. */
  clipped: boolean
}

/** A sample this close to full scale (about -0.1 dBFS) is treated as clipped. */
export const CLIP_THRESHOLD = 0.989
/** The bottom of the meter. */
export const METER_FLOOR_DB = -60

export const SILENT_LEVEL: InputLevel = { rmsDb: -120, peakDb: -120, clipped: false }

export function measureLevel(samples: ArrayLike<number>): InputLevel {
  if (samples.length === 0) return SILENT_LEVEL
  let sumSquares = 0
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i]
    sumSquares += value * value
    peak = Math.max(peak, Math.abs(value))
  }
  return {
    rmsDb: rmsToDb(Math.sqrt(sumSquares / samples.length)),
    peakDb: rmsToDb(peak),
    clipped: peak >= CLIP_THRESHOLD,
  }
}

/** Where a level sits on the meter, 0-100. */
export function levelToPercent(db: number, floorDb = METER_FLOOR_DB): number {
  if (!Number.isFinite(db)) return 0
  return Math.min(100, Math.max(0, ((db - floorDb) / -floorDb) * 100))
}

export type GainAdvice = 'silent' | 'too_quiet' | 'good' | 'hot' | 'clipping'

/** What to tell the player about a recent peak level. */
export function gainAdvice(peakDb: number, clipped: boolean): GainAdvice {
  if (clipped) return 'clipping'
  if (peakDb < -55) return 'silent'
  if (peakDb < -30) return 'too_quiet'
  if (peakDb > -3) return 'hot'
  return 'good'
}

export const GAIN_ADVICE_TEXT: Record<GainAdvice, string> = {
  silent: 'No signal. Check the cable, the input channel and the gain knob.',
  too_quiet: 'Quiet. Turn the gain up on your interface.',
  good: 'Good level.',
  hot: 'Close to clipping. Turn the gain down a little.',
  clipping: 'Clipping! Turn the gain down on your interface.',
}

/**
 * Keeps a clip warning lit for a while after the clip, so a single clipped block is still
 * readable, and tracks the recent peak the same way.
 */
export class LevelHold {
  private clippedUntil = -Infinity
  private peakDb = -120
  private peakUntil = -Infinity
  private readonly holdMs: number

  constructor(holdMs = 1500) {
    this.holdMs = holdMs
  }

  update(level: InputLevel, nowMs: number): { peakDb: number; clipping: boolean } {
    if (level.clipped) this.clippedUntil = nowMs + this.holdMs
    if (level.peakDb >= this.peakDb || nowMs > this.peakUntil) {
      this.peakDb = level.peakDb
      this.peakUntil = nowMs + this.holdMs
    }
    return { peakDb: this.peakDb, clipping: nowMs < this.clippedUntil }
  }
}
