/**
 * The settings page: the audio interface and input to play through, input latency (typed in or
 * measured), and the way to profile settings.
 */
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_INPUT_CHOICE } from '@/audio/devices'
import {
  loadAudioInputChoice,
  loadInputLatencyMs,
  saveAudioInputChoice,
  saveInputLatencyMs,
} from '@/lib/play/settings'
import { Settings } from '@/pages/Settings'
import { renderAtRoute, signedIn } from '@/test/render'

vi.mock('@/lib/play/settings', () => ({
  loadInputLatencyMs: vi.fn(),
  saveInputLatencyMs: vi.fn(),
  loadAudioInputChoice: vi.fn(),
  saveAudioInputChoice: vi.fn(),
}))

vi.mock('@/components/NotificationButton', () => ({
  NotificationButton: ({ uid }: { uid: string }) => (
    <button
      type="button"
      aria-label="Notifications"
      data-testid="notification-button"
    >
      Notifications: {uid}
    </button>
  ),
}))

vi.mock('@/components/LiveElo', () => ({
  LiveElo: () => null,
}))

function renderSettings() {
  return renderAtRoute(<Settings />, { path: '/settings', auth: signedIn() })
}

/** A laptop mic and a four-input interface, with permission already granted. */
function stubDevices(devices = ['Built-in Microphone', 'Scarlett 4i4']) {
  const listed = devices.map((label, index) => ({
    deviceId: `device-${index}`,
    groupId: '',
    kind: 'audioinput',
    label,
  }))
  const track = {
    getCapabilities: () => ({ channelCount: { max: 4 } }),
    getSettings: () => ({ channelCount: 4 }),
    stop: vi.fn(),
  }
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: Object.assign(new EventTarget(), {
      enumerateDevices: vi.fn(async () => listed),
      getUserMedia: vi.fn(async () => ({
        getAudioTracks: () => [track],
        getTracks: () => [track],
      })),
    }),
  })
}

beforeEach(() => {
  vi.mocked(loadInputLatencyMs).mockReset().mockResolvedValue(85)
  vi.mocked(saveInputLatencyMs).mockReset().mockResolvedValue()
  vi.mocked(loadAudioInputChoice).mockReset().mockResolvedValue(DEFAULT_INPUT_CHOICE)
  vi.mocked(saveAudioInputChoice).mockReset().mockResolvedValue()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('audio interface setting', () => {
  it('saves the chosen interface and input channel', async () => {
    stubDevices()
    renderSettings()
    expect(screen.getByRole('heading', { name: 'Audio interface' })).toBeInTheDocument()
    await screen.findByRole('option', { name: 'Scarlett 4i4' })
    await waitFor(() => expect(screen.getByLabelText('Audio device')).toBeEnabled())

    await userEvent.selectOptions(screen.getByLabelText('Audio device'), 'Scarlett 4i4')
    expect(saveAudioInputChoice).toHaveBeenLastCalledWith('user-1', {
      deviceId: 'device-1',
      deviceLabel: 'Scarlett 4i4',
      channel: null,
    })

    // The interface reports four inputs.
    expect(await screen.findByRole('option', { name: 'Input 4' })).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Input channel'), 'Input 3')
    expect(saveAudioInputChoice).toHaveBeenLastCalledWith('user-1', {
      deviceId: 'device-1',
      deviceLabel: 'Scarlett 4i4',
      channel: 2,
    })
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
  })

  it('shows the saved choice, and warns when that interface is not plugged in', async () => {
    vi.mocked(loadAudioInputChoice).mockResolvedValue({
      deviceId: 'gone',
      deviceLabel: 'Old Interface',
      channel: 1,
    })
    stubDevices()
    renderSettings()

    expect(await screen.findByText(/Old Interface is not plugged in/)).toBeInTheDocument()
    expect(loadAudioInputChoice).toHaveBeenCalledWith('user-1')
    expect(screen.getByLabelText('Input channel')).toHaveValue('1')
  })

  it('says when the audio settings cannot be loaded', async () => {
    vi.mocked(loadAudioInputChoice).mockRejectedValue(new Error('offline'))
    renderSettings()
    expect(
      await screen.findByText('Could not load or save your audio settings.'),
    ).toBeInTheDocument()
  })
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

it('opens and dismisses the account deletion dialog', async () => {
  renderSettings()

  const dialog = screen.getByRole('dialog', { hidden: true })
  // jsdom does not implement the browser's modal dialog methods.
  Object.defineProperties(dialog, {
    showModal: { value: () => dialog.setAttribute('open', '') },
    close: { value: () => dialog.removeAttribute('open') },
  })
  await userEvent.click(screen.getByRole('button', { name: 'Delete Account' }))
  expect(screen.getByRole('dialog', { name: 'Delete Account' })).toBe(dialog)

  expect(dialog).toHaveTextContent('30 days')
  expect(screen.getByRole('button', { name: 'Confirm Deletion' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(dialog).not.toHaveAttribute('open')
})
