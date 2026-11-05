/**
 * A stand-in AudioContext for jsdom, which has no Web Audio. It records every oscillator it is
 * asked to start, so tests can check what would have been heard and when.
 */
import { vi } from 'vitest'

class FakeParam {
  value = 0
  setValueAtTime = vi.fn()
  linearRampToValueAtTime = vi.fn()
  exponentialRampToValueAtTime = vi.fn()
  setTargetAtTime = vi.fn()
  cancelScheduledValues = vi.fn()
}

class FakeNode {
  connect = vi.fn((target: unknown) => target)
  disconnect = vi.fn()
}

export interface StartedOscillator {
  frequency: number
  type: string
  start: number
  stop: number | null
}

class FakeOscillator extends FakeNode {
  frequency = new FakeParam()
  type = 'sine'
  private record: StartedOscillator | null = null
  private readonly started: StartedOscillator[]

  constructor(started: StartedOscillator[]) {
    super()
    this.started = started
  }

  start(time: number) {
    this.record = { frequency: this.frequency.value, type: this.type, start: time, stop: null }
    this.started.push(this.record)
  }

  stop(time: number) {
    if (this.record) this.record.stop = time
  }
}

export class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  currentTime = 0
  sampleRate = 48000
  state: AudioContextState = 'running'
  destination = new FakeNode()
  oscillators: StartedOscillator[] = []
  onstatechange: (() => void) | null = null
  resume = vi.fn(async () => {})
  close = vi.fn(async () => {
    this.state = 'closed'
  })

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createGain() {
    return Object.assign(new FakeNode(), { gain: new FakeParam() })
  }

  createDynamicsCompressor() {
    return new FakeNode()
  }

  createOscillator() {
    return new FakeOscillator(this.oscillators)
  }

  /** Oscillators that carry a note's pitch (the playback synth's triangle body). */
  noteTones() {
    return this.oscillators.filter((osc) => osc.type === 'triangle')
  }

  /** Metronome clicks, by their pitch. Avoid notes whose octave lands on 1320 or 1760 Hz. */
  clicks() {
    return this.oscillators.filter((osc) => osc.frequency === 1760 || osc.frequency === 1320)
  }
}

export function installFakeAudioContext() {
  FakeAudioContext.instances = []
  vi.stubGlobal('AudioContext', FakeAudioContext)
}

export function lastAudioContext(): FakeAudioContext {
  const context = FakeAudioContext.instances.at(-1)
  if (!context) throw new Error('No AudioContext was created')
  return context
}
