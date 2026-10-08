import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCORING_RULES } from '@/lib/schema/collections'
import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'

import { ScenarioPlayer } from './ScenarioPlayer'

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

function renderPlayer(pitches: number[]) {
  render(
    <ScenarioPlayer
      expected={notes(pitches)}
      tempoMap={tempoMap}
      rules={DEFAULT_SCORING_RULES}
      defaultInstrument="piano"
      latencyMs={0}
      onFinish={vi.fn()}
    />,
  )
}

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
    const keyboard = { id: 'kb', name: 'Test Keyboard', type: 'input', state: 'connected' }
    const access = Object.assign(new EventTarget(), { inputs: new Map([['kb', keyboard]]) })
    vi.stubGlobal('navigator', { requestMIDIAccess: async () => access })

    renderPlayer([60])
    await userEvent.selectOptions(screen.getByLabelText('Input'), 'midi')
    expect(await screen.findByRole('option', { name: 'Test Keyboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled()
  })
})
