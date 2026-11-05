import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  countInputChannels,
  findDevice,
  inputLabel,
  isDevicePresent,
  watchAudioInputs,
} from './devices'

const device = (deviceId: string, label = '') =>
  ({ deviceId, label, kind: 'audioinput', groupId: '' }) as MediaDeviceInfo

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('findDevice', () => {
  const plugged = [device('mic', 'MacBook Microphone'), device('usb-1', 'Scarlett 2i2 USB')]

  it('finds the saved device by id', () => {
    expect(findDevice(plugged, { deviceId: 'usb-1', deviceLabel: null })).toBe('usb-1')
  })

  it('finds it by name when the browser has given it a new id', () => {
    expect(findDevice(plugged, { deviceId: 'old-id', deviceLabel: 'Scarlett 2i2 USB' })).toBe(
      'usb-1',
    )
  })

  it('falls back to the default input when it is not plugged in', () => {
    expect(findDevice(plugged, { deviceId: 'gone', deviceLabel: 'Babyface Pro' })).toBeNull()
    expect(findDevice(plugged, { deviceId: null, deviceLabel: null })).toBeNull()
  })
})

describe('isDevicePresent', () => {
  it('notices an unplugged device; the default input is always there', () => {
    expect(isDevicePresent([device('usb-1')], 'usb-1')).toBe(true)
    expect(isDevicePresent([device('mic')], 'usb-1')).toBe(false)
    expect(isDevicePresent([], null)).toBe(true)
  })
})

it('names inputs from 1', () => {
  expect(inputLabel(null)).toBe('All inputs (mixed)')
  expect(inputLabel(0)).toBe('Input 1')
  expect(inputLabel(3)).toBe('Input 4')
})

describe('countInputChannels', () => {
  function stubDevice(capabilities: { max?: number }, applied?: number) {
    const track = {
      stop: vi.fn(),
      getCapabilities: () => ({ channelCount: capabilities }),
      getSettings: () => ({ channelCount: applied }),
    }
    const getUserMedia = vi.fn(async (_constraints: MediaStreamConstraints) => ({
      getTracks: () => [track],
      getAudioTracks: () => [track],
    }))
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    return { track, getUserMedia }
  }

  it('reads how many inputs the interface offers, and releases it', async () => {
    const { track, getUserMedia } = stubDevice({ max: 8 })
    expect(await countInputChannels('usb-1')).toBe(8)
    const [constraints] = getUserMedia.mock.calls[0]!
    expect((constraints.audio as MediaTrackConstraints).deviceId).toEqual({ exact: 'usb-1' })
    expect(track.stop).toHaveBeenCalled()
  })

  it('falls back to what was applied, and to one input on failure', async () => {
    stubDevice({}, 2)
    expect(await countInputChannels(null)).toBe(2)
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    expect(await countInputChannels(null)).toBe(1)
  })
})

describe('watchAudioInputs', () => {
  it('lists inputs now and again whenever a device is plugged or unplugged', async () => {
    let devices = [device('mic')]
    const media = Object.assign(new EventTarget(), {
      enumerateDevices: vi.fn(async () => [...devices, { ...device('out'), kind: 'audiooutput' }]),
    })
    vi.stubGlobal('navigator', { mediaDevices: media })
    const seen: string[][] = []

    const stop = watchAudioInputs((list) => seen.push(list.map((d) => d.deviceId)))
    await vi.waitFor(() => expect(seen).toEqual([['mic']]))
    devices = [device('mic'), device('usb-1')]
    media.dispatchEvent(new Event('devicechange'))
    await vi.waitFor(() => expect(seen).toEqual([['mic'], ['mic', 'usb-1']]))

    stop()
    media.dispatchEvent(new Event('devicechange'))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(seen).toHaveLength(2)
  })
})
