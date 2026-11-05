/**
 * The live input behind the tuner and level checks keeps working through interruptions:
 * unplugging and replugging the interface, switching inputs, and an input that drops out.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AudioInputChoice } from './devices'
import { openAudioInput, type AudioInputOptions } from './input'
import { useLiveAudioInput } from './useLiveAudioInput'

vi.mock('./input', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./input')>()),
  openAudioInput: vi.fn(),
}))

const device = (deviceId: string, label: string) =>
  ({ deviceId, label, kind: 'audioinput', groupId: '' }) as MediaDeviceInfo

let plugged: MediaDeviceInfo[]
let media: EventTarget & { enumerateDevices: () => Promise<MediaDeviceInfo[]> }
/** Every input opened, with the options it was opened with, newest last. */
let opened: { options: AudioInputOptions; stop: ReturnType<typeof vi.fn> }[]

const INTERFACE: AudioInputChoice = { deviceId: 'usb-1', deviceLabel: 'Scarlett', channel: 1 }

function plug(devices: MediaDeviceInfo[]) {
  plugged = devices
  media.dispatchEvent(new Event('devicechange'))
}

beforeEach(() => {
  plugged = [device('mic', 'Built-in'), device('usb-1', 'Scarlett')]
  media = Object.assign(new EventTarget(), { enumerateDevices: vi.fn(async () => plugged) })
  vi.stubGlobal('navigator', { mediaDevices: media })
  opened = []
  vi.mocked(openAudioInput)
    .mockReset()
    .mockImplementation(async (options = {}) => {
      const stop = vi.fn(async () => {})
      opened.push({ options, stop })
      return {
        context: { state: 'running', resume: vi.fn() } as unknown as AudioContext,
        settings: {},
        channel: options.channel ?? null,
        takeNotes: () => [],
        readLevel: () => ({ rmsDb: -20, peakDb: -12, clipped: false }),
        isLive: () => true,
        stop,
      }
    })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useLiveAudioInput', () => {
  it('opens the chosen interface and input', async () => {
    const { result } = renderHook(() => useLiveAudioInput({ enabled: true, choice: INTERFACE }))

    await waitFor(() => expect(result.current.status).toBe('live'))
    expect(opened.at(-1)!.options).toMatchObject({ deviceId: 'usb-1', channel: 1 })
    expect(result.current.getLevel()).toMatchObject({ peakDb: -12 })
  })

  it('does nothing until asked to listen', () => {
    const { result } = renderHook(() => useLiveAudioInput({ enabled: false, choice: INTERFACE }))
    expect(result.current.status).toBe('off')
    expect(openAudioInput).not.toHaveBeenCalled()
  })

  it('falls back to the default input while the interface is unplugged, then returns to it', async () => {
    const { result } = renderHook(() => useLiveAudioInput({ enabled: true, choice: INTERFACE }))
    await waitFor(() => expect(result.current.status).toBe('live'))
    const first = opened.at(-1)!

    act(() => {
      first.options.onEnded?.()
      plug([device('mic', 'Built-in')])
    })
    await waitFor(() => expect(result.current.status).toBe('fallback'))
    expect(first.stop).toHaveBeenCalled()
    expect(opened.at(-1)!.options).toMatchObject({ deviceId: undefined, channel: undefined })

    act(() => plug([device('mic', 'Built-in'), device('usb-1', 'Scarlett')]))
    await waitFor(() => expect(result.current.status).toBe('live'))
    expect(opened.at(-1)!.options).toMatchObject({ deviceId: 'usb-1', channel: 1 })
  })

  it('waits for the interface instead when falling back is not wanted', async () => {
    const { result } = renderHook(() =>
      useLiveAudioInput({ enabled: true, choice: INTERFACE, fallbackToDefault: false }),
    )
    await waitFor(() => expect(result.current.status).toBe('live'))

    act(() => plug([device('mic', 'Built-in')]))
    await waitFor(() => expect(result.current.status).toBe('disconnected'))
    const count = opened.length

    act(() => plug([device('mic', 'Built-in'), device('usb-1', 'Scarlett')]))
    await waitFor(() => expect(result.current.status).toBe('live'))
    expect(opened.length).toBe(count + 1)
  })

  it('reopens an input that drops out without being unplugged', async () => {
    const { result } = renderHook(() => useLiveAudioInput({ enabled: true, choice: INTERFACE }))
    await waitFor(() => expect(result.current.status).toBe('live'))

    act(() => opened.at(-1)!.options.onEnded?.())
    expect(result.current.status).toBe('disconnected')
    await waitFor(() => expect(result.current.status).toBe('live'), { timeout: 3000 })
    expect(opened).toHaveLength(2)
  })

  it('switches straight to a newly chosen input', async () => {
    const { result, rerender } = renderHook(
      ({ choice }) => useLiveAudioInput({ enabled: true, choice }),
      { initialProps: { choice: INTERFACE } },
    )
    await waitFor(() => expect(result.current.status).toBe('live'))
    const first = opened.at(-1)!

    rerender({ choice: { ...INTERFACE, channel: 0 } })
    await waitFor(() => expect(opened.at(-1)!.options.channel).toBe(0))
    expect(first.stop).toHaveBeenCalled()
  })

  it('reports a blocked microphone and tries again when asked', async () => {
    vi.mocked(openAudioInput).mockRejectedValueOnce(
      new DOMException('Permission denied', 'NotAllowedError'),
    )
    const { result } = renderHook(() => useLiveAudioInput({ enabled: true, choice: INTERFACE }))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toMatch(/blocked/)
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('live'))
  })

  it('closes the input when no longer needed', async () => {
    const { result, unmount } = renderHook(() =>
      useLiveAudioInput({ enabled: true, choice: INTERFACE }),
    )
    await waitFor(() => expect(result.current.status).toBe('live'))
    unmount()
    expect(opened.at(-1)!.stop).toHaveBeenCalled()
  })
})
