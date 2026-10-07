import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openAudioInput } from './input'

vi.mock('./frame-processor.ts?worker&url', () => ({ default: '/frame-processor.js' }))

const SR = 48000

class FakeTrack {
  stopped = false
  stop() {
    this.stopped = true
  }
  getSettings(): MediaTrackSettings {
    return { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
  }
}

class FakeContext {
  sampleRate = SR
  closed = false
  audioWorklet = { addModule: vi.fn(async () => {}) }
  source = { connect: vi.fn(), disconnect: vi.fn() }
  resume = vi.fn(async () => {})
  close = vi.fn(async () => {
    this.closed = true
  })
  createMediaStreamSource = vi.fn(() => this.source)
}

class FakeWorkletNode {
  static last: FakeWorkletNode
  port: { onmessage: ((event: { data: unknown }) => void) | null } = { onmessage: null }
  readonly name: string
  constructor(_context: unknown, name: string) {
    this.name = name
    FakeWorkletNode.last = this
  }
}

let track: FakeTrack
let getUserMedia: ReturnType<typeof vi.fn>

beforeEach(() => {
  track = new FakeTrack()
  getUserMedia = vi.fn(async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }))
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia, enumerateDevices: vi.fn() } })
  vi.stubGlobal('AudioContext', FakeContext)
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Delivers a sine tone as 128-sample worklet blocks, the way the audio thread does. */
function play(node: FakeWorkletNode, hz: number | null, seconds: number, startTime: number) {
  const block = 128
  for (let i = 0; i < seconds * SR; i += block) {
    const samples = new Float32Array(block)
    if (hz !== null) {
      for (let j = 0; j < block; j++) samples[j] = 0.5 * Math.sin((2 * Math.PI * hz * (i + j)) / SR)
    }
    node.port.onmessage?.({ data: { samples, time: startTime + i / SR } })
  }
}

describe('openAudioInput', () => {
  it('asks for the microphone with voice processing turned off', async () => {
    const input = await openAudioInput()
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        deviceId: undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    })
    expect(input.settings.echoCancellation).toBe(false)
    expect(FakeWorkletNode.last.name).toBe('frame-processor')
  })

  it('requests a specific device when one is chosen', async () => {
    await openAudioInput({ deviceId: 'usb-interface' })
    expect(getUserMedia.mock.calls[0][0].audio.deviceId).toEqual({ exact: 'usb-interface' })
  })

  it('turns worklet blocks into notes on the audio clock', async () => {
    const onNote = vi.fn()
    const onFrame = vi.fn()
    const input = await openAudioInput({ onNote, onFrame })
    const node = FakeWorkletNode.last
    play(node, null, 0.3, 10)
    play(node, 440, 0.5, 10.3)
    play(node, null, 0.3, 10.8)

    const notes = input.takeNotes()
    expect(notes).toHaveLength(1)
    expect(notes[0].midiPitch).toBeCloseTo(69, 1)
    expect(Math.abs(notes[0].startTime - 10.3)).toBeLessThan(0.02)
    expect(onNote).toHaveBeenCalledWith(notes[0])
    expect(onFrame).toHaveBeenCalled()
    expect(input.takeNotes()).toEqual([])
  })

  it('ends a note still sounding when notes are taken', async () => {
    const input = await openAudioInput()
    play(FakeWorkletNode.last, null, 0.2, 0)
    play(FakeWorkletNode.last, 330, 0.4, 0.2)
    expect(input.takeNotes()).toHaveLength(1)
  })

  it('releases the microphone and its own context on stop', async () => {
    const input = await openAudioInput()
    const context = input.context as unknown as FakeContext
    await input.stop()
    expect(track.stopped).toBe(true)
    expect(context.source.disconnect).toHaveBeenCalled()
    expect(context.closed).toBe(true)
  })

  it('leaves a shared context open and loads the worklet into it once', async () => {
    const shared = new FakeContext()
    const context = shared as unknown as AudioContext
    await (await openAudioInput({ context })).stop()
    await (await openAudioInput({ context })).stop()
    expect(shared.closed).toBe(false)
    expect(shared.audioWorklet.addModule).toHaveBeenCalledTimes(1)
  })

  it('releases the microphone if the worklet fails to load', async () => {
    const failing = new FakeContext()
    failing.audioWorklet.addModule.mockRejectedValueOnce(new Error('load failed'))
    await expect(openAudioInput({ context: failing as unknown as AudioContext })).rejects.toThrow(
      'load failed',
    )
    expect(track.stopped).toBe(true)
  })

  it('surfaces a denied permission', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
    await expect(openAudioInput()).rejects.toThrow('Permission denied')
  })

  it('explains that capture needs a secure context', async () => {
    vi.stubGlobal('navigator', {})
    await expect(openAudioInput()).rejects.toThrow('secure context')
  })
})
