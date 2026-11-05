/**
 * User story #37: exporting a run's audio, with the backing track mixed in at the player's
 * chosen volume and kept in time with their playing.
 */
import { describe, expect, it } from 'vitest'

import type { SampleBlock } from './frame-processor'
import { alignTake, isSilent, mixdown, synthesize } from './mixdown'
import { backingTrack, playerTrack, renderRunAudio, runAudioFileName } from './run-audio'
import type { RunTake } from './run-audio'
import { encodeWav } from './wav'

const SR = 1000
const TEMPO = [{ atBeat: 0, bpm: 60, timeSigNum: 4, timeSigDen: 4 }]
const BACKING = [{ index: 0, midiPitch: 48, startBeat: 0, durationBeats: 2, velocity: 100 }]

/** A microphone take: a click at `atSeconds` after beat 0, on an otherwise silent line. */
function micTake(atSeconds: number, latencyMs = 0): RunTake {
  const blocks: SampleBlock[] = []
  const beatZeroTime = 10
  for (let start = -1; start < 3; start += 0.128) {
    const samples = new Float32Array(128)
    const clickAt = Math.round(
      (beatZeroTime + atSeconds + latencyMs / 1000 - (beatZeroTime + start)) * SR,
    )
    if (clickAt >= 0 && clickAt < 128) samples[clickAt] = 0.5
    blocks.push({ samples, time: beatZeroTime + start })
  }
  return { kind: 'microphone', blocks, sampleRate: SR, beatZeroTime, latencyMs }
}

/** The PCM samples back out of a WAV file, for comparing exports. */
function pcm(wav: Uint8Array) {
  return new Int16Array(wav.buffer.slice(44))
}

describe('alignTake', () => {
  it('starts the take at beat 0', () => {
    const track = playerTrack(micTake(0.5), 2000)!

    expect(track).toHaveLength(2 * SR)
    expect(track.indexOf(0.5)).toBe(500)
  })

  it('takes the input latency off, so a late-arriving note lands where it was played', () => {
    const take = micTake(0.5, 40) as Extract<RunTake, { kind: 'microphone' }>
    const track = alignTake(take.blocks, {
      beatZeroTime: take.beatZeroTime,
      latencyMs: 40,
      sampleRate: SR,
      seconds: 2,
    })

    expect(track.indexOf(0.5)).toBe(500)
  })
})

describe('renderRunAudio', () => {
  it('exports a playable WAV whose length matches the run', () => {
    const audio = renderRunAudio({
      take: micTake(0.5),
      durationMs: 2000,
      backing: [],
      tempoMap: TEMPO,
      backingVolume: 0.6,
    })!

    expect(new TextDecoder().decode(audio.wav.slice(0, 4))).toBe('RIFF')
    expect(audio.durationMs).toBe(2000)
    expect(pcm(audio.wav)).toHaveLength(2 * SR)
  })

  it('exports only the player when the scenario has no backing track', () => {
    const take = micTake(0.5)
    const audio = renderRunAudio({
      take,
      durationMs: 2000,
      backing: [],
      tempoMap: TEMPO,
      backingVolume: 1,
    })!

    expect(audio.wav).toEqual(encodeWav(playerTrack(take, 2000)!, SR))
  })

  it('treats a backing volume of 0 as no backing track', () => {
    const take = micTake(0.5)
    const silent = renderRunAudio({
      take,
      durationMs: 2000,
      backing: BACKING,
      tempoMap: TEMPO,
      backingVolume: 0,
    })!
    const none = renderRunAudio({
      take,
      durationMs: 2000,
      backing: [],
      tempoMap: TEMPO,
      backingVolume: 0,
    })!

    expect(silent.wav).toEqual(none.wav)
  })

  it('is unavailable when nothing was recorded', () => {
    // The click falls after the take ends, so the microphone heard only silence.
    const silence = micTake(99)
    const noNotes: RunTake = { kind: 'midi', notes: [] }

    expect(
      renderRunAudio({
        take: silence,
        durationMs: 2000,
        backing: BACKING,
        tempoMap: TEMPO,
        backingVolume: 1,
      }),
    ).toBeNull()
    expect(
      renderRunAudio({
        take: noNotes,
        durationMs: 2000,
        backing: BACKING,
        tempoMap: TEMPO,
        backingVolume: 1,
      }),
    ).toBeNull()
  })

  it('synthesizes a MIDI run from the notes that were pressed', () => {
    const take: RunTake = {
      kind: 'midi',
      notes: [{ midiPitch: 60, startMs: 250, durationMs: 500, velocity: 100 }],
    }
    const track = playerTrack(take, 1000)!

    expect(isSilent(track.subarray(0, Math.round(0.25 * 44100) - 1))).toBe(true)
    expect(isSilent(track.subarray(Math.round(0.25 * 44100), Math.round(0.75 * 44100)))).toBe(false)
  })
})

describe('mixdown', () => {
  const player = new Float32Array([0.1, -0.2, 0.3, 0])
  const backing = new Float32Array([0.5, 0.5, -0.5, -0.5])

  it('scales only the backing track by the chosen volume', () => {
    const mixed = mixdown(player, backing, 0.4)

    for (let i = 0; i < player.length; i++) {
      expect(mixed[i] - 0.4 * backing[i]).toBeCloseTo(player[i], 6)
    }
  })

  it('never changes the player level, whatever the backing volume', () => {
    for (const volume of [0, 0.25, 1]) {
      const mixed = mixdown(player, backing, volume)
      const playerPart = mixed.map((sample, i) => sample - volume * backing[i])
      expect([...playerPart].map((x) => Number(x.toFixed(6)))).toEqual(
        [...player].map((x) => Number(x.toFixed(6))),
      )
    }
  })

  it('leaves the backing out at volume 0', () => {
    expect(mixdown(player, backing, 0)).toEqual(player)
  })
})

describe('backingTrack', () => {
  it('starts its notes on the beats the chart gives them', () => {
    const late = [{ ...BACKING[0], startBeat: 1, durationBeats: 1 }]
    const track = backingTrack(late, TEMPO, 8000, 3)!

    // At 60bpm beat 1 is one second in.
    expect(isSilent(track.subarray(0, 7990))).toBe(true)
    expect(isSilent(track.subarray(8000, 16000))).toBe(false)
  })

  it('is absent when the scenario has no other parts', () => {
    expect(backingTrack([], TEMPO, SR, 2)).toBeNull()
  })
})

describe('synthesize', () => {
  it('gets louder with velocity', () => {
    const peak = (velocity: number) =>
      Math.max(
        ...synthesize(
          [{ midiPitch: 60, startSeconds: 0, durationSeconds: 0.2, velocity }],
          8000,
          0.3,
        ),
      )

    expect(peak(120)).toBeGreaterThan(peak(40))
  })
})

describe('runAudioFileName', () => {
  it('names the file after the scenario and the day it was played', () => {
    expect(runAudioFileName('Ode to Joy', new Date(2026, 9, 19, 15, 30))).toBe(
      'Ode to Joy 2026-10-19.wav',
    )
    expect(runAudioFileName('a/b: c?', new Date(2026, 0, 5))).toBe('ab c 2026-01-05.wav')
  })
})
