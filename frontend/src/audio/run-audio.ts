/**
 * The audio of one finished run, ready to export or share (user story #37).
 *
 * A microphone run keeps what the microphone heard; a MIDI run has no sound of its own, so the
 * notes the player pressed are synthesized. Either way the result is a mono track starting at
 * beat 0, and the scenario's other parts can be synthesized underneath it as a backing track.
 */
import { fileNameFor } from '@/lib/download'
import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'
import { beatToMs, type PerformedNote } from '@/scoring/score'

import type { SampleBlock } from './frame-processor'
import { alignTake, isSilent, mixdown, synthesize, type SynthNote } from './mixdown'
import { encodeWav } from './wav'

/** What a run captured of the player, before it becomes samples. */
export type RunTake =
  | {
      kind: 'microphone'
      blocks: SampleBlock[]
      sampleRate: number
      /** AudioContext time of beat 0. */
      beatZeroTime: number
      latencyMs: number
    }
  | { kind: 'midi'; notes: PerformedNote[] }

/** MIDI runs and backing tracks are synthesized at CD rate. */
export const SYNTH_SAMPLE_RATE = 44100
/** Lets the last note ring out instead of being cut at the final beat. */
const TAIL_SECONDS = 1

export interface RunAudioInput {
  take: RunTake
  /** How long the run lasted, from beat 0 to the moment it ended. */
  durationMs: number
  /** The scenario's other parts, in beats; empty when it has none. */
  backing: readonly ExpectedNote[]
  tempoMap: TempoMapEntry[]
  /** 0 to 1; 0 leaves the backing out. */
  backingVolume: number
}

export interface RunAudio {
  wav: Uint8Array
  sampleRate: number
  durationMs: number
}

/** The player's own track, or null when nothing was recorded. */
export function playerTrack(take: RunTake, durationMs: number): Float32Array | null {
  const seconds = durationMs / 1000
  if (take.kind === 'microphone') {
    const track = alignTake(take.blocks, {
      beatZeroTime: take.beatZeroTime,
      latencyMs: take.latencyMs,
      sampleRate: take.sampleRate,
      seconds,
    })
    return isSilent(track) ? null : track
  }
  if (take.notes.length === 0) return null
  const notes: SynthNote[] = take.notes.map((note) => ({
    midiPitch: Math.round(note.midiPitch),
    startSeconds: note.startMs / 1000,
    durationSeconds: note.durationMs / 1000,
    velocity: note.velocity,
  }))
  return synthesize(notes, SYNTH_SAMPLE_RATE, seconds + TAIL_SECONDS)
}

export function takeSampleRate(take: RunTake) {
  return take.kind === 'microphone' ? take.sampleRate : SYNTH_SAMPLE_RATE
}

/** The backing parts as samples, at the player's sample rate so the two can be summed. */
export function backingTrack(
  backing: readonly ExpectedNote[],
  tempoMap: TempoMapEntry[],
  sampleRate: number,
  seconds: number,
): Float32Array | null {
  if (backing.length === 0) return null
  const notes: SynthNote[] = backing.map((note) => {
    const startMs = beatToMs(note.startBeat, tempoMap)
    return {
      midiPitch: note.midiPitch,
      startSeconds: startMs / 1000,
      durationSeconds: (beatToMs(note.startBeat + note.durationBeats, tempoMap) - startMs) / 1000,
      velocity: note.velocity,
    }
  })
  return synthesize(notes, sampleRate, seconds)
}

/** The whole export: the player, the backing at the chosen volume, encoded as a WAV file. */
export function renderRunAudio(input: RunAudioInput): RunAudio | null {
  const player = playerTrack(input.take, input.durationMs)
  if (!player) return null
  const sampleRate = takeSampleRate(input.take)
  const backing =
    input.backingVolume > 0
      ? backingTrack(input.backing, input.tempoMap, sampleRate, player.length / sampleRate)
      : null
  const mixed = mixdown(player, backing, input.backingVolume)
  return {
    wav: encodeWav(mixed, sampleRate),
    sampleRate,
    durationMs: Math.round((mixed.length / sampleRate) * 1000),
  }
}

/** "Ode to Joy 2026-10-19.wav": the scenario title and the day the run was played. */
export function runAudioFileName(title: string, playedAt: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${playedAt.getFullYear()}-${pad(playedAt.getMonth() + 1)}-${pad(playedAt.getDate())}`
  return `${fileNameFor(title, 'Clash of Jams run')} ${date}.wav`
}
