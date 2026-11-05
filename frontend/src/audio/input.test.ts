import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openAudioInput } from './input'

vi.mock('./frame-processor.ts?worker&url', () => ({ default: '/frame-processor.js' }))

const SR = 48000

class FakeTrack extends EventTarget {
  stopped = false
  channelCount = 1
  stop() {
    this.stopped = true
  }
  getSettings(): MediaTrackSettings {
    return {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: this.channelCount,
    }
  }
  /** What the browser does when the device is unplugged. */
  unplug() {
    this.dispatchEvent(new Event('ended'))
  }
}

class FakeNode {
  connections: { target: unknown; output?: number }[] = []
  connect = vi.fn((target: unknown, output?: number) => {
    this.connections.push({ target, output })
    return target
  })
  disconnect = vi.fn()
}

class FakeAnalyser extends FakeNode {
  fftSize = 2048
  samples = new Float32Array(0)
  getFloatTimeDomainData(into: Float32Array) {
    into.fill(0)
    into.set(this.samples.subarray(0, into.length))
  }
}

class FakeContext {
  sampleRate = SR
  closed = false
  audioWorklet = { addModule: vi.fn(async () => {}) }
  source = new FakeNode()
  splitter: (FakeNode & { outputs: number }) | null = null
  analyser = new FakeAnalyser()
  resume = vi.fn(async () => {})
  close = vi.fn(async () => {
    this.closed = true
  })
  createMediaStreamSource = vi.fn(() => this.source)
  createChannelSplitter = vi.fn((outputs: number) => {
    this.splitter = Object.assign(new FakeNode(), { outputs })
    return this.splitter
  })
  createGain = vi.fn(() => new FakeNode())
  createAnalyser = vi.fn(() => this.analyser)
}

class FakeWorkletNode extends FakeNode {
  static last: FakeWorkletNode
  port: { onmessage: ((event: { data: unknown }) => void) | null } = { onmessage: null }
  readonly name: string
  constructor(_context: unknown, name: string) {
    super()
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

  it('analyzes only the chosen input of a multi-input interface', async () => {
    track.channelCount = 4
    const input = await openAudioInput({ deviceId: 'usb-interface', channel: 2 })
    const context = input.context as unknown as FakeContext

    expect(getUserMedia.mock.calls[0][0].audio.channelCount).toEqual({ ideal: 3 })
    expect(context.createChannelSplitter).toHaveBeenCalledWith(4)
    // The splitter feeds a single node from output 2, and only that node reaches the detector.
    const picked = context.splitter!.connections
    expect(picked).toHaveLength(1)
    expect(picked[0].output).toBe(2)
    expect(context.source.connections.map((c) => c.target)).toEqual([context.splitter])
    expect(input.channel).toBe(2)
  })

  it('refuses an input the device does not have', async () => {
    track.channelCount = 2
    await expect(openAudioInput({ channel: 5 })).rejects.toThrow('Input 6 is not available')
    expect(track.stopped).toBe(true)
  })

  it('reports the level of the analyzed signal, including clipping', async () => {
    const input = await openAudioInput()
    const context = input.context as unknown as FakeContext
    context.analyser.samples = new Float32Array(2048).fill(0.5)
    expect(input.readLevel().rmsDb).toBeCloseTo(-6.02, 1)
    expect(input.readLevel().clipped).toBe(false)
    context.analyser.samples = new Float32Array(2048).fill(1)
    expect(input.readLevel().clipped).toBe(true)
  })

  it('reports an unplugged device and keeps the note that was sounding', async () => {
    const onEnded = vi.fn()
    const input = await openAudioInput({ onEnded })
    play(FakeWorkletNode.last, null, 0.2, 0)
    play(FakeWorkletNode.last, 330, 0.4, 0.2)

    track.unplug()

    expect(onEnded).toHaveBeenCalledTimes(1)
    expect(input.isLive()).toBe(false)
    expect(input.takeNotes()).toHaveLength(1)
  })

  it('does not report a device it stopped itself', async () => {
    const onEnded = vi.fn()
    const input = await openAudioInput({ onEnded })
    await input.stop()
    track.unplug()
    expect(onEnded).not.toHaveBeenCalled()
  })

  it('explains that capture needs a secure context', async () => {
    vi.stubGlobal('navigator', {})
    await expect(openAudioInput()).rejects.toThrow('secure context')
  })
})
