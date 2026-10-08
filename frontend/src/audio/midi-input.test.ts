import { describe, expect, it, vi } from 'vitest'

import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'
import { scorePerformance } from '@/scoring/score'

import {
  listMidiInputs,
  MidiRecorder,
  openMidiInput,
  parseMidiMessage,
  requestMidiAccess,
} from './midi-input'

// Channel 1 status bytes. Other channels only change the low four bits.
const noteOn = (pitch: number, velocity: number) => [0x90, pitch, velocity]
const noteOff = (pitch: number) => [0x80, pitch, 64]

describe('parseMidiMessage', () => {
  it('reads Note On with its pitch and velocity', () => {
    expect(parseMidiMessage(noteOn(60, 100))).toEqual({ type: 'noteOn', pitch: 60, velocity: 100 })
  })

  it('reads Note Off', () => {
    expect(parseMidiMessage(noteOff(60))).toEqual({ type: 'noteOff', pitch: 60, velocity: 0 })
  })

  it('treats Note On with velocity 0 as Note Off', () => {
    expect(parseMidiMessage(noteOn(60, 0)).type).toBe('noteOff')
  })

  it('reads notes on any channel', () => {
    expect(parseMidiMessage([0x9a, 64, 90]).type).toBe('noteOn')
    expect(parseMidiMessage([0x8f, 64, 0]).type).toBe('noteOff')
  })

  it('ignores other messages such as the sustain pedal', () => {
    expect(parseMidiMessage([0xb0, 64, 127]).type).toBe('other')
  })
})

describe('MidiRecorder', () => {
  it('times a note from scenario beat 0', () => {
    const recorder = new MidiRecorder()
    recorder.start(1000)
    recorder.handleMessage(noteOn(60, 100), 1500)
    const ended = recorder.handleMessage(noteOff(60), 1900)
    expect(ended).toEqual({ midiPitch: 60, startMs: 500, durationMs: 400, velocity: 100 })
  })

  it('ends the right note when several are held', () => {
    const recorder = new MidiRecorder()
    recorder.start(0)
    recorder.handleMessage(noteOn(60, 80), 0)
    recorder.handleMessage(noteOn(64, 90), 10)
    const ended = recorder.handleMessage(noteOff(60), 500)
    expect(ended?.midiPitch).toBe(60)
    expect(recorder.heldCount).toBe(1)
  })

  it('ends a note on a velocity-0 Note On', () => {
    const recorder = new MidiRecorder()
    recorder.start(0)
    recorder.handleMessage(noteOn(62, 70), 100)
    expect(recorder.handleMessage(noteOn(62, 0), 300)?.durationMs).toBe(200)
  })

  it('ignores a Note Off for a key that was never pressed', () => {
    const recorder = new MidiRecorder()
    recorder.start(0)
    expect(recorder.handleMessage(noteOff(60), 100)).toBeNull()
    expect(recorder.takeNotes(200)).toEqual([])
  })

  it('records a three-note chord', () => {
    const recorder = new MidiRecorder()
    recorder.start(0)
    for (const pitch of [60, 64, 67]) recorder.handleMessage(noteOn(pitch, 100), 0)
    for (const pitch of [60, 64, 67]) recorder.handleMessage(noteOff(pitch), 500)
    const notes = recorder.takeNotes(600)
    expect(notes.map((n) => n.midiPitch)).toEqual([60, 64, 67])
    expect(notes.every((n) => n.startMs === 0 && n.durationMs === 500)).toBe(true)
  })

  it('ends held notes when notes are taken', () => {
    const recorder = new MidiRecorder()
    recorder.start(0)
    recorder.handleMessage(noteOn(60, 100), 0)
    expect(recorder.takeNotes(250)).toEqual([
      { midiPitch: 60, startMs: 0, durationMs: 250, velocity: 100 },
    ])
    expect(recorder.takeNotes(300)).toEqual([])
  })

  it('passes 1000 notes to the scoring engine with every onset intact', () => {
    // 1000 sixteenth notes at 120 bpm, so one starts every 125 ms.
    const tempoMap: TempoMapEntry[] = [{ atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 }]
    const expected: ExpectedNote[] = []
    for (let i = 0; i < 1000; i++) {
      expected.push({
        index: i,
        midiPitch: 21 + ((i * 7) % 88),
        startBeat: i / 4,
        durationBeats: 0.2,
        velocity: 100,
      })
    }

    const recorder = new MidiRecorder()
    recorder.start(5000)
    for (const note of expected) {
      const startMs = 5000 + note.startBeat * 500
      recorder.handleMessage(noteOn(note.midiPitch, 100), startMs)
      recorder.handleMessage(noteOff(note.midiPitch), startMs + 100)
    }
    const performed = recorder.takeNotes(600000)

    const { breakdown } = scorePerformance({ expected, tempoMap, performed })
    const hits = breakdown.noteResults.filter((r) => r.verdict === 'hit').length
    expect(hits / expected.length).toBeGreaterThanOrEqual(0.999)
    expect(breakdown.extraNotes).toBe(0)
  })
})

/** A stand-in for the browser's MIDIAccess, with one keyboard that can be unplugged. */
class FakeMidiAccess extends EventTarget {
  keyboard = {
    id: 'keyboard-1',
    name: 'Test Keyboard',
    type: 'input',
    state: 'connected',
    onmidimessage: null as ((event: { data: Uint8Array; timeStamp: number }) => void) | null,
  }
  inputs = new Map([[this.keyboard.id, this.keyboard]])

  press(data: number[], timeStamp: number) {
    this.keyboard.onmidimessage?.({ data: new Uint8Array(data), timeStamp })
  }

  setPlugged(plugged: boolean) {
    this.keyboard.state = plugged ? 'connected' : 'disconnected'
    const event = new Event('statechange') as Event & { port: unknown }
    event.port = this.keyboard
    this.dispatchEvent(event)
  }
}

function openFake(options: { onConnectionChange?: (connected: boolean) => void } = {}) {
  const access = new FakeMidiAccess()
  const connection = openMidiInput({
    access: access as unknown as MIDIAccess,
    deviceId: access.keyboard.id,
    ...options,
  })
  return { access, connection }
}

describe('openMidiInput', () => {
  it('lists connected input devices', () => {
    const access = new FakeMidiAccess()
    expect(listMidiInputs(access as unknown as MIDIAccess).map((i) => i.name)).toEqual([
      'Test Keyboard',
    ])
    access.keyboard.state = 'disconnected'
    expect(listMidiInputs(access as unknown as MIDIAccess)).toEqual([])
  })

  it('records notes from the selected controller', () => {
    const { access, connection } = openFake()
    connection.start(1000)
    access.press(noteOn(60, 100), 1200)
    access.press(noteOff(60), 1500)
    expect(connection.takeNotes()).toEqual([
      { midiPitch: 60, startMs: 200, durationMs: 300, velocity: 100 },
    ])
  })

  it('handles the controller being unplugged and plugged back in', () => {
    const onConnectionChange = vi.fn()
    const { access, connection } = openFake({ onConnectionChange })
    connection.start(0)
    expect(connection.isConnected()).toBe(true)

    access.press(noteOn(60, 100), 100)
    access.setPlugged(false)
    expect(connection.isConnected()).toBe(false)
    expect(onConnectionChange).toHaveBeenLastCalledWith(false)

    access.setPlugged(true)
    expect(connection.isConnected()).toBe(true)
    access.press(noteOn(62, 100), 2000)
    access.press(noteOff(62), 2200)

    const notes = connection.takeNotes()
    // The note held while unplugged is ended at the disconnect, not lost.
    expect(notes.map((n) => n.midiPitch)).toEqual([60, 62])
  })

  it('stops listening when stopped', () => {
    const { access, connection } = openFake()
    connection.start(0)
    connection.stop()
    access.press(noteOn(60, 100), 100)
    expect(connection.takeNotes()).toEqual([])
  })

  it('explains when the browser has no MIDI support', async () => {
    vi.stubGlobal('navigator', {})
    await expect(requestMidiAccess()).rejects.toThrow('cannot use MIDI controllers')
    vi.unstubAllGlobals()
  })
})
