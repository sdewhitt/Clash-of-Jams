/** The audio interface choice is remembered on userSettings/{uid} between sessions. */
import { getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  audioInputChoiceFrom,
  loadAudioInputChoice,
  saveAudioInputChoice,
} from '@/lib/play/settings'

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'now'),
}))

/** A one-document Firestore: whatever was last written is what the next read returns. */
let stored: Record<string, unknown> | null

beforeEach(() => {
  stored = null
  vi.mocked(getDoc)
    .mockReset()
    .mockImplementation(async () => {
      const data = stored
      return { exists: () => data !== null, data: () => data } as never
    })
  vi.mocked(setDoc)
    .mockReset()
    .mockImplementation(async (_ref, data) => {
      stored = { ...(data as Record<string, unknown>) }
    })
  vi.mocked(updateDoc)
    .mockReset()
    .mockImplementation(async (_ref, data) => {
      stored = { ...stored, ...(data as unknown as Record<string, unknown>) }
    })
})

describe('audio input choice', () => {
  it('saves the device and channel and loads them back', async () => {
    stored = { uid: 'u1', inputLatencyOffsetMs: 40 }
    const choice = { deviceId: 'usb-1', deviceLabel: 'Scarlett 2i2 USB', channel: 1 }

    await saveAudioInputChoice('u1', choice)

    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'userSettings/u1' },
      {
        audioInputDeviceId: 'usb-1',
        audioInputDeviceLabel: 'Scarlett 2i2 USB',
        audioInputChannel: 1,
        updatedAt: 'now',
      },
    )
    expect(await loadAudioInputChoice('u1')).toEqual(choice)
    // Other settings are left alone.
    expect(stored?.inputLatencyOffsetMs).toBe(40)
  })

  it('creates the settings document if the account has none', async () => {
    await saveAudioInputChoice('u1', { deviceId: 'usb-1', deviceLabel: null, channel: 0 })
    expect(setDoc).toHaveBeenCalled()
    expect(stored).toMatchObject({ uid: 'u1', audioInputDeviceId: 'usb-1', audioInputChannel: 0 })
  })

  it('defaults to the browser input for accounts that never chose one', async () => {
    expect(await loadAudioInputChoice('u1')).toEqual({
      deviceId: null,
      deviceLabel: null,
      channel: null,
    })
  })

  it('ignores malformed values', () => {
    expect(
      audioInputChoiceFrom({
        audioInputDeviceId: '',
        audioInputChannel: -1,
      } as never),
    ).toEqual({ deviceId: null, deviceLabel: null, channel: null })
    expect(audioInputChoiceFrom({ audioInputChannel: 1.5 } as never).channel).toBeNull()
  })
})
