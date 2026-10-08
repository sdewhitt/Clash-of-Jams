import type { PerformedNote } from '@/scoring/score'

// The top four bits of a MIDI status byte are the message type; the bottom four are the channel.
const NOTE_OFF = 0x80
const NOTE_ON = 0x90

export interface MidiNoteMessage {
  type: 'noteOn' | 'noteOff' | 'other'
  pitch: number
  velocity: number
}

/** Reads one raw MIDI message. A Note On with velocity 0 means Note Off. */
export function parseMidiMessage(data: ArrayLike<number>): MidiNoteMessage {
  const messageType = data[0] & 0xf0
  const pitch = data[1] ?? 0
  const velocity = data[2] ?? 0

  if (messageType === NOTE_ON && velocity > 0) {
    return { type: 'noteOn', pitch, velocity }
  }
  if (messageType === NOTE_OFF || messageType === NOTE_ON) {
    return { type: 'noteOff', pitch, velocity: 0 }
  }
  return { type: 'other', pitch, velocity }
}

interface HeldNote {
  startMs: number
  velocity: number
}

/**
 * Turns Note On / Note Off messages into finished notes for the scoring engine.
 *
 * All times are in performance.now() milliseconds, the clock MIDI events are stamped with.
 * Notes are timed from `scenarioStartMs`, the moment of scenario beat 0.
 */
export class MidiRecorder {
  private scenarioStartMs = 0
  /** Keys still pressed, by pitch. Several at once is a chord. */
  private heldNotes = new Map<number, HeldNote>()
  private finishedNotes: PerformedNote[] = []

  /** Clears anything recorded and starts timing from a new beat 0. */
  start(scenarioStartMs: number) {
    this.scenarioStartMs = scenarioStartMs
    this.heldNotes.clear()
    this.finishedNotes = []
  }

  /** Returns the note that ended, if this message ended one. */
  handleMessage(data: ArrayLike<number>, timeMs: number): PerformedNote | null {
    const message = parseMidiMessage(data)

    if (message.type === 'noteOn') {
      // A key pressed again without being released first ends the earlier press.
      const ended = this.endNote(message.pitch, timeMs)
      this.heldNotes.set(message.pitch, { startMs: timeMs, velocity: message.velocity })
      return ended
    }

    if (message.type === 'noteOff') {
      return this.endNote(message.pitch, timeMs)
    }

    return null
  }

  /** Ends every held note, e.g. when the controller is unplugged. */
  releaseAll(timeMs: number) {
    for (const pitch of [...this.heldNotes.keys()]) {
      this.endNote(pitch, timeMs)
    }
  }

  /** How many keys are pressed right now. */
  get heldCount(): number {
    return this.heldNotes.size
  }

  /** Returns every finished note since the last call, ending notes still held. */
  takeNotes(timeMs: number): PerformedNote[] {
    this.releaseAll(timeMs)
    const notes = this.finishedNotes
    this.finishedNotes = []
    return notes
  }

  private endNote(pitch: number, timeMs: number): PerformedNote | null {
    const held = this.heldNotes.get(pitch)
    if (!held) return null
    this.heldNotes.delete(pitch)

    const note: PerformedNote = {
      midiPitch: pitch,
      startMs: held.startMs - this.scenarioStartMs,
      durationMs: timeMs - held.startMs,
      velocity: held.velocity,
    }
    this.finishedNotes.push(note)
    return note
  }
}

/** Asks the browser for MIDI access. Chrome, Edge and Opera support it; Safari does not. */
export async function requestMidiAccess(): Promise<MIDIAccess> {
  if (!navigator.requestMIDIAccess) {
    throw new Error('This browser cannot use MIDI controllers. Try Chrome or Edge.')
  }
  return navigator.requestMIDIAccess()
}

/** Lists the MIDI input devices (keyboards, pads, ...) that are plugged in. */
export function listMidiInputs(access: MIDIAccess): MIDIInput[] {
  const inputs: MIDIInput[] = []
  access.inputs.forEach((input) => {
    if (input.state === 'connected') inputs.push(input)
  })
  return inputs
}

/**
 * Converts an AudioContext time (seconds) to performance.now() time (milliseconds), so the
 * Gameplay Engine's audio clock and MIDI timestamps can be compared.
 */
export function audioTimeToPerformanceMs(context: BaseAudioContext, audioTime: number): number {
  return performance.now() + (audioTime - context.currentTime) * 1000
}

export interface MidiInputOptions {
  access: MIDIAccess
  deviceId: string
  onNoteOn?: (pitch: number, velocity: number) => void
  onNote?: (note: PerformedNote) => void
  onConnectionChange?: (connected: boolean) => void
}

export interface MidiInputConnection {
  /** Starts recording; `scenarioStartMs` is beat 0 on the performance.now() clock. */
  start(scenarioStartMs: number): void
  isConnected(): boolean
  /** Returns every note since the last call, ending notes still held. */
  takeNotes(): PerformedNote[]
  stop(): void
}

/** Listens to one MIDI controller, and keeps listening if it is unplugged and plugged back in. */
export function openMidiInput(options: MidiInputOptions): MidiInputConnection {
  const { access, deviceId } = options
  const recorder = new MidiRecorder()
  let connected = false

  function onMessage(event: MIDIMessageEvent) {
    if (!event.data) return
    const message = parseMidiMessage(event.data)
    if (message.type === 'noteOn') options.onNoteOn?.(message.pitch, message.velocity)
    const ended = recorder.handleMessage(event.data, event.timeStamp)
    if (ended) options.onNote?.(ended)
  }

  function listen() {
    const input = access.inputs.get(deviceId)
    if (!input || input.state !== 'connected') return
    input.onmidimessage = onMessage
    connected = true
    options.onConnectionChange?.(true)
  }

  function onStateChange(event: MIDIConnectionEvent) {
    const port = event.port
    if (!port || port.id !== deviceId || port.type !== 'input') return

    if (port.state === 'disconnected' && connected) {
      connected = false
      recorder.releaseAll(performance.now())
      options.onConnectionChange?.(false)
    } else if (port.state === 'connected' && !connected) {
      listen()
    }
  }

  access.addEventListener('statechange', onStateChange)
  listen()

  return {
    start(scenarioStartMs) {
      recorder.start(scenarioStartMs)
    },
    isConnected() {
      return connected
    },
    takeNotes() {
      return recorder.takeNotes(performance.now())
    },
    stop() {
      access.removeEventListener('statechange', onStateChange)
      const input = access.inputs.get(deviceId)
      if (input) input.onmidimessage = null
      connected = false
    },
  }
}
