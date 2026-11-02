import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCORING_RULES } from '@/lib/schema/collections'
import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'

import { ScenarioPlayer, type PlayerSetup } from './ScenarioPlayer'

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

function renderPlayer(pitches: number[], initialSetup?: PlayerSetup) {
  render(
    <ScenarioPlayer
      expected={notes(pitches)}
      tempoMap={tempoMap}
      rules={DEFAULT_SCORING_RULES}
      defaultInstrument="piano"
      latencyMs={0}
      initialSetup={initialSetup}
      onFinish={vi.fn()}
    />,
  )
}

function stubTwoKeyboards() {
  const inputs = new Map([
    ['kb1', { id: 'kb1', name: 'Keyboard One', type: 'input', state: 'connected' }],
    ['kb2', { id: 'kb2', name: 'Keyboard Two', type: 'input', state: 'connected' }],
  ])
  const access = Object.assign(new EventTarget(), { inputs })
  vi.stubGlobal('navigator', { requestMIDIAccess: async () => access })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ScenarioPlayer', () => {
  it('starts from the previous run setup', async () => {
    stubTwoKeyboards()
    renderPlayer([60], { instrument: 'guitar', inputKind: 'midi', midiDeviceId: 'kb2' })

    expect(screen.getByLabelText('Instrument')).toHaveValue('guitar')
    expect(screen.getByLabelText('Input')).toHaveValue('midi')
    await screen.findByRole('option', { name: 'Keyboard Two' })
    expect(screen.getByLabelText('MIDI controller')).toHaveValue('kb2')
  })

  it('falls back to the first controller when the previous one is unplugged', async () => {
    stubTwoKeyboards()
    renderPlayer([60], { instrument: 'piano', inputKind: 'midi', midiDeviceId: 'unplugged' })

    await screen.findByRole('option', { name: 'Keyboard One' })
    expect(screen.getByLabelText('MIDI controller')).toHaveValue('kb1')
  })

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
    const keyboard = { id: 'kb', name: 'Test Keyboard', type: 'input', state: 'connected' }
    const access = Object.assign(new EventTarget(), { inputs: new Map([['kb', keyboard]]) })
    vi.stubGlobal('navigator', { requestMIDIAccess: async () => access })

    renderPlayer([60])
    await userEvent.selectOptions(screen.getByLabelText('Input'), 'midi')
    expect(await screen.findByRole('option', { name: 'Test Keyboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled()
  })
})
