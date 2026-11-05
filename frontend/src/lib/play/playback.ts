/**
 * Playback mode: the scenario played back to the player, so they can hear it before playing it.
 *
 * planPlayback is pure and turns a timeline into tones on the audio clock; schedulePlayback
 * hands those tones to Web Audio. Both work from a Timeline, which is already scaled by the
 * speed multiplier, so playback at 0.5x is simply a timeline built at 0.5x.
 */
import type { Timeline } from '@/lib/play/timeline'

export interface ScheduledTone {
  /** AudioContext time the tone starts, in seconds. */
  time: number
  hz: number
  /** Peak gain, 0-1, from the note's velocity. */
  gain: number
  /** Seconds the note is held, before its release. */
  duration: number
  /** The expected note this tone sounds. */
  noteIndex: number
}

/** Shortest tone, so zero-length or very short notes are still audible. */
export const MIN_TONE_SECONDS = 0.04
/** Gain of a velocity-127 note; quieter notes scale down from it. */
const MAX_TONE_GAIN = 0.3
const ATTACK_SECONDS = 0.01
const RELEASE_SECONDS = 0.08

export function midiToHz(midiPitch: number): number {
  return 440 * 2 ** ((midiPitch - 69) / 12)
}

export function velocityToGain(velocity: number): number {
  const clamped = Math.min(127, Math.max(1, Number.isFinite(velocity) ? velocity : 96))
  return (clamped / 127) * MAX_TONE_GAIN
}

/**
 * The tones that sound from scenario position `fromMs` on. `startTime` is the AudioContext time
 * of scenario position 0, so a tone at `startMs` sounds at `startTime + startMs / 1000`; to
 * resume from the middle, pass `startTime = now - fromMs / 1000`. A note already sounding at
 * `fromMs` is cut to the part that remains.
 */
export function planPlayback(timeline: Timeline, startTime: number, fromMs = 0): ScheduledTone[] {
  const tones: ScheduledTone[] = []
  for (const { note, startMs, endMs } of timeline.notes) {
    if (endMs <= fromMs && startMs < fromMs) continue
    const from = Math.max(startMs, fromMs)
    tones.push({
      time: startTime + from / 1000,
      hz: midiToHz(note.midiPitch),
      gain: velocityToGain(note.velocity),
      duration: Math.max(MIN_TONE_SECONDS, (endMs - from) / 1000),
      noteIndex: note.index,
    })
  }
  return tones
}

/** The notes sounding at scenario position `ms`, for highlighting what is being heard. */
export function soundingNotes(timeline: Timeline, ms: number): Timeline['notes'] {
  return timeline.notes.filter(({ startMs, endMs }) => startMs <= ms && ms < endMs)
}

/** Schedules every tone now and returns a function that silences them, including ones sounding. */
export function schedulePlayback(
  context: BaseAudioContext,
  tones: ScheduledTone[],
  volume = 1,
): () => void {
  // Chords add up; the compressor keeps a dense passage from clipping.
  const compressor = context.createDynamicsCompressor()
  const master = context.createGain()
  master.gain.value = volume
  compressor.connect(master).connect(context.destination)

  for (const tone of tones) {
    const end = tone.time + tone.duration
    const envelope = context.createGain()
    envelope.gain.setValueAtTime(0, tone.time)
    envelope.gain.linearRampToValueAtTime(tone.gain, tone.time + ATTACK_SECONDS)
    envelope.gain.setTargetAtTime(tone.gain * 0.6, tone.time + ATTACK_SECONDS, 0.15)
    envelope.gain.setTargetAtTime(0, end, RELEASE_SECONDS / 4)
    envelope.connect(compressor)

    // A triangle carries the pitch; a quieter octave above keeps low notes audible on laptops.
    const body = context.createOscillator()
    body.type = 'triangle'
    body.frequency.value = tone.hz
    body.connect(envelope)

    const overtone = context.createOscillator()
    const overtoneGain = context.createGain()
    overtone.type = 'sine'
    overtone.frequency.value = tone.hz * 2
    overtoneGain.gain.value = 0.3
    overtone.connect(overtoneGain).connect(envelope)

    for (const oscillator of [body, overtone]) {
      oscillator.start(tone.time)
      oscillator.stop(end + RELEASE_SECONDS)
    }
  }

  return () => {
    master.gain.cancelScheduledValues(0)
    master.disconnect()
  }
}
