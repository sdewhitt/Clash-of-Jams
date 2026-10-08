/** The settings page: input latency, typed in or measured, and the way to profile settings. */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadInputLatencyMs, saveInputLatencyMs } from '@/lib/play/settings'
import { Settings } from '@/pages/Settings'
import { renderAtRoute, signedIn } from '@/test/render'

vi.mock('@/lib/play/settings', () => ({
  loadInputLatencyMs: vi.fn(),
  saveInputLatencyMs: vi.fn(),
}))

function renderSettings() {
  return renderAtRoute(<Settings />, { path: '/settings', auth: signedIn() })
}

beforeEach(() => {
  vi.mocked(loadInputLatencyMs).mockReset().mockResolvedValue(85)
  vi.mocked(saveInputLatencyMs).mockReset().mockResolvedValue()
})

describe('settings page', () => {
  it("shows the player's saved input latency", async () => {
    renderSettings()

    expect(screen.getByRole('heading', { name: 'Input latency' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Latency (ms)')).toHaveValue(85))
    expect(loadInputLatencyMs).toHaveBeenCalledWith('user-1')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('saves a typed-in latency', async () => {
    renderSettings()
    const field = screen.getByLabelText('Latency (ms)')
    await waitFor(() => expect(field).toHaveValue(85))

    await userEvent.clear(field)
    await userEvent.type(field, '120')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(saveInputLatencyMs).toHaveBeenCalledWith('user-1', 120)
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('says when the save fails and leaves it ready to retry', async () => {
    vi.mocked(saveInputLatencyMs).mockRejectedValue(new Error('permission-denied'))
    renderSettings()
    const field = screen.getByLabelText('Latency (ms)')
    await waitFor(() => expect(field).toHaveValue(85))

    await userEvent.clear(field)
    await userEvent.type(field, '40')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Could not save your settings.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('reports a microphone that cannot be opened for calibration', async () => {
    renderSettings()
    await waitFor(() => expect(screen.getByLabelText('Latency (ms)')).toHaveValue(85))

    // jsdom has no navigator.mediaDevices, which is what an insecure page looks like.
    await userEvent.click(screen.getByRole('button', { name: 'Calibrate' }))

    expect(await screen.findByText(/Microphone input needs a secure context/)).toBeInTheDocument()
    expect(saveInputLatencyMs).not.toHaveBeenCalled()
  })

  it('links to the profile settings that live elsewhere', async () => {
    renderSettings()

    await userEvent.click(screen.getByRole('button', { name: 'Open profile settings' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/profile/edit_profile')
  })
})
