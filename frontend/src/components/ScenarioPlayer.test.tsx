import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { openAudioInput, type AudioInputOptions } from '@/audio/input'
import { midiToHz } from '@/lib/play/playback'
import { DEFAULT_SCORING_RULES } from '@/lib/schema/collections'
import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'
import { installFakeAudioContext, lastAudioContext } from '@/test/audio'

import { DISCONNECTED_MESSAGE, ScenarioPlayer, type FinishedRun } from './ScenarioPlayer'

vi.mock('@/audio/input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/audio/input')>()),
  openAudioInput: vi.fn(),
  listAudioInputs: vi.fn(async () => []),
}))

const tempoMap: TempoMapEntry[] = [{ atBeat: 0, bpm: 100, timeSigNum: 4, timeSigDen: 4 }]

function notes(pitches: number[]): ExpectedNote[] {
  return pitches.map((midiPitch, index) => ({
    index,
    midiPitch,
    startBeat: index,
    durationBeats: 1,
    velocity: 100,
  }))
}

function renderPlayer(pitches: number[], onFinish = vi.fn()) {
  render(
    <ScenarioPlayer
      expected={notes(pitches)}
      tempoMap={tempoMap}
      rules={DEFAULT_SCORING_RULES}
      defaultInstrument="piano"
      latencyMs={0}
      onFinish={onFinish}
    />,
  )
  return onFinish
}

function stubMidiKeyboard() {
  const keyboard = { id: 'kb', name: 'Test Keyboard', type: 'input', state: 'connected' }
  const access = Object.assign(new EventTarget(), { inputs: new Map([['kb', keyboard]]) })
  vi.stubGlobal('navigator', { requestMIDIAccess: async () => access })
}

beforeEach(() => {
  installFakeAudioContext()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ScenarioPlayer', () => {
  it('starts with piano and the microphone selected', () => {
    renderPlayer([60, 62, 64])
    expect(screen.getByLabelText('Instrument')).toHaveValue('piano')
    expect(screen.getByLabelText('Input')).toHaveValue('microphone')
    expect(screen.getByText(/3 notes at 100 bpm/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled()
  })

  it('warns when the scenario has notes outside the piano range', () => {
    renderPlayer([10, 60, 120])
    expect(screen.getByText(/2 notes in this scenario are outside the piano/)).toBeInTheDocument()
  })

  it('lists MIDI controllers when MIDI input is chosen', async () => {
    stubMidiKeyboard()
    renderPlayer([60])
    await userEvent.selectOptions(screen.getByLabelText('Input'), 'midi')
    expect(await screen.findByRole('option', { name: 'Test Keyboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled()
  })

  it('offers the audio interface and input channel for the microphone', () => {
    renderPlayer([60])
    expect(screen.getByLabelText('Audio device')).toHaveValue('')
    expect(screen.getByLabelText('Input channel')).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Input 2' })).toBeInTheDocument()
  })
})

describe('speed', () => {
  it('starts at 1x and shows the written tempo', () => {
    renderPlayer([60, 62])
    expect(screen.getByLabelText('Speed')).toHaveValue('1')
    expect(screen.getByRole('status', { name: 'Current speed' })).toHaveTextContent(
      '1x · 100 bpm',
    )
  })

  it('shows the chosen speed and the tempo it plays at', async () => {
    renderPlayer([60, 62])
    await userEvent.click(screen.getByRole('button', { name: '0.5x' }))

    expect(screen.getByRole('status', { name: 'Current speed' })).toHaveTextContent(
      '0.5x · 50 bpm (written 100 bpm)',
    )
    expect(screen.getByText(/2 notes at 50 bpm/)).toBeInTheDocument()
  })

  it('locks the speed while playing and reports it with the finished run', async () => {
    stubMidiKeyboard()
    const onFinish = renderPlayer([60, 62])
    await userEvent.click(screen.getByRole('button', { name: '1.5x' }))
    await userEvent.selectOptions(screen.getByLabelText('Input'), 'midi')
    await screen.findByRole('option', { name: 'Test Keyboard' })

    await userEvent.click(screen.getByRole('button', { name: 'Start' }))

    expect(await screen.findByRole('button', { name: 'Stop and see results' })).toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Speed presets' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Locked speed')).toHaveTextContent('1.5x · 150 bpm')
    // The count-in is one bar at the played tempo: 400 ms per beat at 150 bpm.
    const clicks = lastAudioContext().clicks().map((click) => click.start)
    expect(clicks).toHaveLength(4)
    expect(clicks[1] - clicks[0]).toBeCloseTo(0.4, 6)

    await userEvent.click(screen.getByRole('button', { name: 'Stop and see results' }))
    const run: FinishedRun = onFinish.mock.calls[0][0]
    expect(run.speedMultiplier).toBe(1.5)
  })
})

describe('playback mode', () => {
  it('plays the scenario back, and reschedules from the same beat when the speed changes', async () => {
    renderPlayer([60, 62, 64])
    await userEvent.click(screen.getByRole('button', { name: 'Listen' }))

    const playback = screen.getByRole('region', { name: 'Scenario playback' })
    expect(within(playback).getByTestId('note-highway')).toBeInTheDocument()
    await userEvent.click(within(playback).getByRole('button', { name: 'Play' }))

    const context = lastAudioContext()
    const firstPass = context.noteTones().map((tone) => [tone.frequency, tone.start])
    // 100 bpm: one note every 600 ms, starting just after pressing Play.
    expect(firstPass.map(([hz]) => hz)).toEqual([midiToHz(60), midiToHz(62), midiToHz(64)])
    expect(firstPass[1][1] - firstPass[0][1]).toBeCloseTo(0.6, 6)
    expect(within(playback).getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    // Halfway through the second note, slow to half speed.
    context.currentTime = firstPass[0][1] + 0.9
    await userEvent.click(within(playback).getByRole('button', { name: '0.5x' }))

    const rescheduled = context.noteTones().slice(3)
    expect(rescheduled.map((tone) => tone.frequency)).toEqual([midiToHz(62), midiToHz(64)])
    // The rest of the second note, then the third a full (now 1200 ms) beat later.
    expect(rescheduled[1].start - rescheduled[0].start).toBeCloseTo(0.6, 6)
    expect(within(playback).getByRole('status', { name: 'Current speed' })).toHaveTextContent(
      '0.5x · 50 bpm',
    )

    await userEvent.click(within(playback).getByRole('button', { name: 'Back to setup' }))
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
    // The speed chosen while listening carries over to playing.
    expect(screen.getByText(/3 notes at 50 bpm/)).toBeInTheDocument()
  })

  it('pauses and resumes where it left off', async () => {
    renderPlayer([60, 62, 64])
    await userEvent.click(screen.getByRole('button', { name: 'Listen' }))
    await userEvent.click(screen.getByRole('button', { name: 'Play' }))
    const context = lastAudioContext()
    const firstStart = context.noteTones()[0].start

    context.currentTime = firstStart + 0.7
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }))

    // 700 ms in, the second note (600-1200 ms) has 500 ms left and the third is next.
    const resumed = context.noteTones().slice(3)
    expect(resumed.map((tone) => tone.frequency)).toEqual([midiToHz(62), midiToHz(64)])
  })

  it('adds metronome clicks when asked', async () => {
    renderPlayer([60, 62])
    await userEvent.click(screen.getByRole('button', { name: 'Listen' }))
    await userEvent.click(screen.getByLabelText('Metronome'))
    await userEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(lastAudioContext().clicks()).toHaveLength(2)
  })
})

describe('audio interface disconnects', () => {
  it('stops the scenario and says why when the interface is unplugged mid-run', async () => {
    let options: AudioInputOptions = {}
    vi.mocked(openAudioInput).mockImplementation(async (opened = {}) => {
      options = opened
      return {
        context: opened.context!,
        settings: {},
        channel: null,
        takeNotes: () => [],
        readLevel: () => ({ rmsDb: -30, peakDb: -20, clipped: false }),
        isLive: () => true,
        stop: vi.fn(async () => {}),
      }
    })
    const onFinish = renderPlayer([60, 62])

    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(await screen.findByRole('meter', { name: 'Input level' })).toBeInTheDocument()

    act(() => options.onEnded?.())

    expect(screen.getByRole('alert')).toHaveTextContent(DISCONNECTED_MESSAGE)
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument()
    expect(onFinish).not.toHaveBeenCalled()
    expect(lastAudioContext().close).toHaveBeenCalled()
  })
})
