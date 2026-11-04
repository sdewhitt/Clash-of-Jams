/**
 * Builds the audio a player exports after a run (user story #37): their own playing, and the
 * scenario's backing parts underneath it at a volume they choose.
 *
 * Everything here is plain sample arithmetic on Float32Arrays, so it runs the same in the
 * browser and under test. Both tracks are mono, at one sample rate, with sample 0 at scenario
 * beat 0 -- that shared origin is what keeps the backing in time with the player.
 */
import type { SampleBlock } from './frame-processor'

/** A note to synthesize, already placed in seconds from beat 0. */
export interface SynthNote {
  midiPitch: number
  startSeconds: number
  durationSeconds: number
  velocity: number
}

const HARMONICS = [1, 0.5, 0.3, 0.18, 0.1]
const ATTACK_SECONDS = 0.005
const RELEASE_SECONDS = 0.08
/** Leaves headroom so a chord of loud notes rarely clips. */
const NOTE_LEVEL = 0.3

/**
 * A soft keyboard-like tone for each note: a few harmonics under a quick attack, a decay
 * toward sustain, and a short release past the note's end so notes don't click off.
 */
export function synthesize(
  notes: readonly SynthNote[],
  sampleRate: number,
  totalSeconds: number,
): Float32Array {
  const out = new Float32Array(Math.max(0, Math.ceil(totalSeconds * sampleRate)))
  for (const note of notes) {
    const f0 = 440 * 2 ** ((note.midiPitch - 69) / 12)
    const harmonics = HARMONICS.filter((_, h) => f0 * (h + 1) < sampleRate * 0.45)
    const scale =
      (NOTE_LEVEL * (note.velocity / 127)) / harmonics.reduce((sum, level) => sum + level, 0)
    const first = Math.round(note.startSeconds * sampleRate)
    const held = Math.round(note.durationSeconds * sampleRate)
    const release = Math.round(RELEASE_SECONDS * sampleRate)

    for (let i = Math.max(0, -first); i < held + release && first + i < out.length; i++) {
      const t = i / sampleRate
      const attack = Math.min(1, t / ATTACK_SECONDS)
      const body = 0.5 + 0.5 * Math.exp(-t / 0.3)
      const tail = i < held ? 1 : 1 - (i - held) / release
      const phase = 2 * Math.PI * f0 * t
      let sample = 0
      for (let h = 0; h < harmonics.length; h++) sample += harmonics[h] * Math.sin((h + 1) * phase)
      out[first + i] += scale * attack * body * tail * sample
    }
  }
  return out
}

/**
 * Lines up microphone blocks, stamped on the audio clock, into one track starting at beat 0.
 *
 * Sound reaches the microphone `latencyMs` after it is played, so the track starts that much
 * after beat 0 -- the same correction the scoring engine applies to detected notes.
 */
export function alignTake(
  blocks: readonly SampleBlock[],
  {
    beatZeroTime,
    latencyMs,
    sampleRate,
    seconds,
  }: {
    beatZeroTime: number
    latencyMs: number
    sampleRate: number
    seconds: number
  },
): Float32Array {
  const out = new Float32Array(Math.max(0, Math.ceil(seconds * sampleRate)))
  const origin = beatZeroTime + latencyMs / 1000
  for (const block of blocks) {
    const offset = Math.round((block.time - origin) * sampleRate)
    for (let i = 0; i < block.samples.length; i++) {
      const at = offset + i
      if (at >= 0 && at < out.length) out[at] = block.samples[i]
    }
  }
  return out
}

/**
 * The player's track with the backing mixed under it. The player's level never changes;
 * `backingVolume` (0 to 1) scales only the backing, and 0 leaves it out entirely.
 */
export function mixdown(
  player: Float32Array,
  backing: Float32Array | null,
  backingVolume: number,
): Float32Array {
  const volume = Math.min(1, Math.max(0, backingVolume))
  if (!backing || volume === 0) return player.slice()
  const out = new Float32Array(Math.max(player.length, backing.length))
  out.set(player)
  for (let i = 0; i < backing.length; i++) out[i] += volume * backing[i]
  return out
}

/** True when a track is silent, i.e. there is nothing worth exporting. */
export function isSilent(samples: Float32Array, threshold = 1e-4) {
  for (let i = 0; i < samples.length; i++) if (Math.abs(samples[i]) > threshold) return false
  return true
}
