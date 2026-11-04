/**
 * User story #37 on the results screen: download a run's audio and choose the backing track
 * volume. The mixing itself is tested in audio/run-audio.test.ts.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RunTake } from '@/audio/run-audio'
import { RunAudioExport, type RunAudioExportProps } from '@/components/RunAudioExport'
import { downloadBytes } from '@/lib/download'

vi.mock('@/lib/download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/download')>()),
  downloadBytes: vi.fn(),
}))

const MIDI_TAKE: RunTake = {
  kind: 'midi',
  notes: [{ midiPitch: 60, startMs: 0, durationMs: 400, velocity: 90 }],
}

function renderExport(overrides: Partial<RunAudioExportProps> = {}) {
  return render(
    <RunAudioExport
      title="Ode to Joy"
      take={MIDI_TAKE}
      durationMs={1000}
      backing={[{ index: 0, midiPitch: 48, startBeat: 0, durationBeats: 1, velocity: 80 }]}
      tempoMap={[{ atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 }]}
      playedAt={new Date(2026, 9, 19)}
      {...overrides}
    />,
  )
}

beforeEach(() => {
  vi.mocked(downloadBytes).mockReset()
})

describe('RunAudioExport', () => {
  it('downloads the run as a WAV named after the scenario and date', async () => {
    renderExport()

    fireEvent.click(screen.getByRole('button', { name: 'Download audio' }))

    await waitFor(() => expect(downloadBytes).toHaveBeenCalledOnce())
    const [wav, fileName, type] = vi.mocked(downloadBytes).mock.calls[0]
    expect(fileName).toBe('Ode to Joy 2026-10-19.wav')
    expect(type).toBe('audio/wav')
    expect(new TextDecoder().decode((wav as Uint8Array).slice(0, 4))).toBe('RIFF')
  })

  it('offers a backing volume, including off, when the scenario has a backing track', () => {
    renderExport()
    const slider = screen.getByRole('slider', { name: /Backing track/ })

    fireEvent.change(slider, { target: { value: '0' } })

    expect(screen.getByText('Off')).toBeInTheDocument()
  })

  it('hides the backing controls when there is no backing track', () => {
    renderExport({ backing: [] })

    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download audio' })).toBeInTheDocument()
  })

  it('says clearly when a run has no audio to export', () => {
    renderExport({ take: { kind: 'midi', notes: [] } })

    expect(screen.getByText(/No audio was recorded for this run/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download audio' })).not.toBeInTheDocument()
  })
})
