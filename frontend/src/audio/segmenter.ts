import { dbToVelocity, type AudioFrame } from './analysis'

/** A finished note, timed on the AudioContext clock. */
export interface DetectedNote {
  /** Fractional MIDI pitch; the fraction carries cents for the scoring engine. */
  midiPitch: number
  /** AudioContext time of the onset, in seconds. */
  startTime: number
  durationSeconds: number
  /** 1-127, from the note's peak level. */
  velocity: number
  /** Median pitch clarity across the note, 0-1. */
  confidence: number
}

export interface SegmenterOptions {
  /** The gate never opens below this level, in dBFS. */
  minGateDb: number
  /** How far above the measured noise floor the gate opens, in dB. */
  gateMarginDb: number
  /** The gate closes this many dB below where it opens. */
  gateHysteresisDb: number
  /** Time constant, in seconds, of the noise floor creeping up toward the input level. */
  noiseFloorRiseSeconds: number
  /** A note ends once the level stays below the closing gate this long. */
  releaseMs: number
  /** Frames below this clarity count as unpitched. */
  minClarity: number
  /** Shorter notes are dropped as clicks, taps and breaths. */
  minNoteMs: number
  /** Notes with a smaller share of pitched frames are dropped as noise. */
  minPitchedFraction: number
  /** Notes whose median absolute pitch deviation exceeds this, in semitones, are dropped as unstable. */
  maxPitchDeviation: number
  /** A pitch this many semitones from the sounding note, held for splitMs, starts a new note. */
  splitSemitones: number
  splitMs: number
  /** A level jump of this many dB within reattackMs restarts the note (a repeated pluck or bow). */
  reattackDb: number
  reattackMs: number
  velocityFloorDb: number
  velocityCeilingDb: number
  /** How far pitch estimates trail level, from FrameAnalyzer.pitchLagMs. */
  pitchLagMs: number
}

export const DEFAULT_SEGMENTER_OPTIONS: SegmenterOptions = {
  minGateDb: -55,
  gateMarginDb: 12,
  gateHysteresisDb: 6,
  noiseFloorRiseSeconds: 2,
  releaseMs: 30,
  minClarity: 0.8,
  minNoteMs: 60,
  minPitchedFraction: 0.5,
  maxPitchDeviation: 0.5,
  splitSemitones: 0.75,
  splitMs: 40,
  reattackDb: 10,
  reattackMs: 30,
  velocityFloorDb: -50,
  velocityCeilingDb: -6,
  pitchLagMs: 0,
}

interface ActiveNote {
  start: number
  frames: AudioFrame[]
  /** When the level last fell below the closing gate, or null while it is above. */
  belowSince: number | null
  /** Consecutive pitched frames away from the note's pitch; a candidate new note. */
  run: AudioFrame[]
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Groups frames into notes and filters out silence, noise and unstable pitch. */
export class NoteSegmenter {
  readonly options: SegmenterOptions

  private noiseFloorDb = Infinity
  private lastTime: number | null = null
  private active: ActiveNote | null = null

  constructor(options: Partial<SegmenterOptions> = {}) {
    this.options = { ...DEFAULT_SEGMENTER_OPTIONS, ...options }
  }

  /** The level, in dBFS, a frame needs to open a note. */
  get gateDb(): number {
    return Math.max(this.options.minGateDb, this.noiseFloorDb + this.options.gateMarginDb)
  }

  /** Returns any notes that ended at this frame. */
  push(frame: AudioFrame): DetectedNote[] {
    this.trackNoiseFloor(frame)
    this.lastTime = frame.time
    const out: DetectedNote[] = []
    const note = this.active

    if (!note) {
      if (frame.db >= this.gateDb) this.active = this.begin(frame.time, [frame])
      return out
    }

    if (frame.db < this.gateDb - this.options.gateHysteresisDb) {
      note.belowSince ??= frame.time
      if (frame.time - note.belowSince >= this.options.releaseMs / 1000) {
        this.finish(out, note, note.belowSince)
        this.active = null
      } else {
        note.frames.push(frame)
      }
      return out
    }
    const end = note.belowSince ?? frame.time
    note.belowSince = null

    if (this.isReattack(note, frame)) {
      this.finish(out, note, end)
      this.active = this.begin(frame.time, [frame])
      return out
    }

    if (this.isPitchChange(note, frame)) {
      const splitAt = Math.max(note.start, note.run[0].time - this.options.pitchLagMs / 1000)
      this.finish(out, note, splitAt)
      this.active = this.begin(splitAt, note.run)
      return out
    }
    if (note.run.length === 0) note.frames.push(frame)
    return out
  }

  /** Ends the sounding note, if any. Call when the performance stops. */
  flush(): DetectedNote[] {
    const out: DetectedNote[] = []
    if (this.active && this.lastTime !== null) {
      this.finish(out, this.active, this.active.belowSince ?? this.lastTime)
    }
    this.active = null
    return out
  }

  private begin(start: number, frames: AudioFrame[]): ActiveNote {
    return { start, frames: [...frames], belowSince: null, run: [] }
  }

  /** Falls to quiet levels at once and rises slowly, so a held note barely moves it. */
  private trackNoiseFloor(frame: AudioFrame) {
    if (this.active && frame.midi !== null) return
    if (frame.db < this.noiseFloorDb) {
      this.noiseFloorDb = frame.db
    } else if (this.lastTime !== null) {
      const dt = frame.time - this.lastTime
      const k = 1 - Math.exp(-dt / this.options.noiseFloorRiseSeconds)
      this.noiseFloorDb += (frame.db - this.noiseFloorDb) * k
    }
  }

  private isReattack(note: ActiveNote, frame: AudioFrame): boolean {
    const { minNoteMs, reattackMs, reattackDb } = this.options
    if (frame.time - note.start < minNoteMs / 1000) return false
    const cutoff = frame.time - reattackMs / 1000
    for (let i = note.frames.length - 1; i >= 0; i--) {
      if (note.frames[i].time <= cutoff) return frame.db - note.frames[i].db >= reattackDb
    }
    return false
  }

  /** Tracks a run of frames at a new pitch; true once it has lasted splitMs. */
  private isPitchChange(note: ActiveNote, frame: AudioFrame): boolean {
    const { minClarity, splitSemitones, splitMs } = this.options
    if (frame.midi === null || frame.clarity < minClarity) return false
    const recent = note.frames
      .filter((f) => f.midi !== null && f.clarity >= minClarity)
      .slice(-16)
      .map((f) => f.midi as number)
    if (recent.length === 0) return false

    if (Math.abs(frame.midi - median(recent)) < splitSemitones) {
      note.run = []
      return false
    }
    const runPitch = note.run.length ? median(note.run.map((f) => f.midi as number)) : frame.midi
    note.run = Math.abs(frame.midi - runPitch) < splitSemitones ? [...note.run, frame] : [frame]
    return frame.time - note.run[0].time >= splitMs / 1000
  }

  private finish(out: DetectedNote[], note: ActiveNote, end: number) {
    const o = this.options
    const durationSeconds = end - note.start
    if (durationSeconds * 1000 < o.minNoteMs) return

    const frames = note.frames.filter((f) => f.time < end)
    const pitched = frames.filter((f) => f.midi !== null && f.clarity >= o.minClarity)
    if (pitched.length === 0 || pitched.length / frames.length < o.minPitchedFraction) return

    const pitches = pitched.map((f) => f.midi as number)
    const midiPitch = median(pitches)
    if (median(pitches.map((p) => Math.abs(p - midiPitch))) > o.maxPitchDeviation) return

    const peakDb = Math.max(...frames.map((f) => f.db))
    out.push({
      midiPitch,
      startTime: note.start,
      durationSeconds,
      velocity: dbToVelocity(peakDb, o.velocityFloorDb, o.velocityCeilingDb),
      confidence: median(pitched.map((f) => f.clarity)),
    })
  }
}
