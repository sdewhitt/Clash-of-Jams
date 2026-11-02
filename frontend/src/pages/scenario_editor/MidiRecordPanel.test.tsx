/**
 * User story #26: recording from a MIDI controller into the editor.
 *
 * Web MIDI and Web Audio are faked: the controller is an object whose onmidimessage the test
 * calls, and the audio context only needs to accept scheduled clicks. The ms-to-beat
 * conversion itself is covered in lib/chart/record.test.ts.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { saveMidiLatencyMs } from '@/lib/play/settings'
import { emptyChart } from '@/lib/schema/collections'
import { MidiRecordPanel } from '@/pages/scenario_editor/MidiRecordPanel'

vi.mock('@/lib/play/settings', () => ({
  loadMidiLatencyMs: vi.fn(async () => 0),
  saveMidiLatencyMs: vi.fn(async () => {}),
}))

const NOW = 1000

function audioNode(): Record<string, unknown> {
  const param = { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
  const node: Record<string, unknown> = {
    gain: param,
    frequency: param,
    connect: (next: unknown) => next,
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }
  return node
}

class FakeAudioContext {
  currentTime = 0
  destination = audioNode()
  createGain = audioNode
  createOscillator = audioNode
  close = vi.fn(async () => {})
}

function fakeController() {
  const input = {
    id: 'kb',
    name: 'Practice Keyboard',
    type: 'input',
    state: 'connected',
    onmidimessage: null as ((event: { data: Uint8Array; timeStamp: number }) => void) | null,
  }
  const access = {
    inputs: new Map([[input.id, input]]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const send = (bytes: number[], timeStamp: number) =>
    act(() => input.onmidimessage?.({ data: new Uint8Array(bytes), timeStamp }))
  return { access, send }
}

function setMidi(access: unknown) {
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    configurable: true,
    value: access === undefined ? undefined : vi.fn(async () => access),
  })
}

beforeEach(() => {
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.spyOn(performance, 'now').mockReturnValue(NOW)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess
})

function renderPanel() {
  const onPreview = vi.fn()
  const onCommit = vi.fn()
  render(
    <MidiRecordPanel
      chart={emptyChart('piano')}
      uid="user-1"
      onPreview={onPreview}
      onCommit={onCommit}
    />,
  )
  return { onPreview, onCommit }
}

describe('MidiRecordPanel', () => {
  it('says so when the browser has no Web MIDI, without blocking the editor', () => {
    renderPanel()

    expect(screen.getByText(/can't use MIDI controllers/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Record' })).not.toBeInTheDocument()
  })

  it('says so when no controller is plugged in', async () => {
    setMidi({ inputs: new Map(), addEventListener: vi.fn(), removeEventListener: vi.fn() })
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Connect MIDI controller' }))

    expect(await screen.findByText(/No MIDI controller is connected/)).toBeInTheDocument()
  })

  it('records notes from the controller and commits them in beats', async () => {
    const { access, send } = fakeController()
    setMidi(access)
    const { onPreview, onCommit } = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Connect MIDI controller' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Record' }))

    // 120bpm 4/4: beat 0 lands after a 150ms delay and a four-beat count-in.
    const beatZero = NOW + 150 + 4 * 500
    send([0x90, 60, 100], beatZero + 500)
    send([0x80, 60, 0], beatZero + 1000)
    send([0x90, 64, 45], beatZero + 1000)
    send([0x90, 64, 0], beatZero + 1250)

    expect(onPreview).toHaveBeenLastCalledWith({
      notes: [
        { midiPitch: 60, startBeat: 1, durationBeats: 1, velocity: 100 },
        { midiPitch: 64, startBeat: 2, durationBeats: 0.5, velocity: 45 },
      ],
      replace: false,
    })

    fireEvent.click(screen.getByRole('button', { name: /Stop/ }))

    expect(onCommit).toHaveBeenCalledWith(
      [
        { midiPitch: 60, startBeat: 1, durationBeats: 1, velocity: 100 },
        { midiPitch: 64, startBeat: 2, durationBeats: 0.5, velocity: 45 },
      ],
      false,
    )
    expect(onPreview).toHaveBeenLastCalledWith(null)
    expect(screen.getByText('Recorded 2 notes.')).toBeInTheDocument()
  })

  it('replaces the part when asked', async () => {
    const { access, send } = fakeController()
    setMidi(access)
    const { onCommit } = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Connect MIDI controller' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Replace existing notes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    send([0x90, 60, 100], NOW + 2150)
    send([0x80, 60, 0], NOW + 2650)
    fireEvent.click(screen.getByRole('button', { name: /Stop/ }))

    expect(onCommit).toHaveBeenCalledWith([expect.objectContaining({ startBeat: 0 })], true)
  })

  it('calibrates from notes played on the clicks and saves the latency', async () => {
    const { access, send } = fakeController()
    setMidi(access)
    renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Connect MIDI controller' }))
    const calibrate = await screen.findByRole('button', { name: 'Calibrate' })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    fireEvent.click(calibrate)

    // 100bpm clicks after a 150ms delay and four lead-in clicks; each note lands 25ms late.
    const firstClick = NOW + 150 + 4 * 600
    for (let click = 0; click < 10; click++) {
      const at = firstClick + click * 600 + 25
      send([0x90, 60, 90], at)
      send([0x80, 60, 0], at + 100)
    }
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    vi.useRealTimers()

    expect(screen.getByText('Latency 25 ms')).toBeInTheDocument()
    expect(saveMidiLatencyMs).toHaveBeenCalledWith('user-1', 25)
  })

  it('reports an empty take instead of committing nothing', async () => {
    const { access } = fakeController()
    setMidi(access)
    const { onCommit } = renderPanel()

    fireEvent.click(screen.getByRole('button', { name: 'Connect MIDI controller' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Record' }))
    fireEvent.click(screen.getByRole('button', { name: /Stop/ }))

    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByText('Nothing was recorded.')).toBeInTheDocument()
  })
})
