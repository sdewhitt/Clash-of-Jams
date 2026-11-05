/**
 * Audio interfaces and microphones: listing them, finding how many inputs one has, and
 * noticing when one is plugged in or pulled out.
 */
import { listAudioInputs } from './input'

export interface AudioInputChoice {
  /** null is the browser's default input. */
  deviceId: string | null
  /** Remembered so a device can be found again if the browser gives it a new id. */
  deviceLabel: string | null
  /** The input (channel) on the device, from 0; null mixes the device down to one channel. */
  channel: number | null
}

export const DEFAULT_INPUT_CHOICE: AudioInputChoice = {
  deviceId: null,
  deviceLabel: null,
  channel: null,
}

/** The most inputs offered in the picker; browsers rarely expose more. */
export const MAX_CHANNELS = 32

/**
 * The saved device among those plugged in now: by id, then by label (ids can change when site
 * data is cleared). Null when it is not plugged in, which plays from the default input.
 */
export function findDevice(
  devices: Pick<MediaDeviceInfo, 'deviceId' | 'label'>[],
  choice: Pick<AudioInputChoice, 'deviceId' | 'deviceLabel'>,
): string | null {
  if (!choice.deviceId) return null
  if (devices.some((device) => device.deviceId === choice.deviceId)) return choice.deviceId
  const byLabel = choice.deviceLabel
    ? devices.find((device) => device.label === choice.deviceLabel)
    : undefined
  return byLabel?.deviceId ?? null
}

/** Whether a device chosen for a run is still plugged in. The default input always is. */
export function isDevicePresent(
  devices: Pick<MediaDeviceInfo, 'deviceId'>[],
  deviceId: string | null,
): boolean {
  return deviceId === null || devices.some((device) => device.deviceId === deviceId)
}

export function inputLabel(channel: number | null): string {
  return channel === null ? 'All inputs (mixed)' : `Input ${channel + 1}`
}

export function deviceLabel(device: Pick<MediaDeviceInfo, 'deviceId' | 'label'>, index: number) {
  if (device.label) return device.label
  return device.deviceId === 'default' ? 'Default input' : `Audio input ${index + 1}`
}

/**
 * How many inputs the browser exposes for a device. Opens it briefly, so it needs microphone
 * permission; returns 1 if the device cannot be opened.
 */
export async function countInputChannels(deviceId: string | null): Promise<number> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: MAX_CHANNELS },
      },
    })
    const track = stream.getAudioTracks()[0]
    const capable = track?.getCapabilities?.().channelCount?.max
    const applied = track?.getSettings().channelCount
    stream.getTracks().forEach((t) => t.stop())
    return Math.min(MAX_CHANNELS, Math.max(1, capable ?? applied ?? 1))
  } catch {
    return 1
  }
}

/** Lists inputs now and on every plug or unplug. Returns a function that stops listening. */
export function watchAudioInputs(onChange: (devices: MediaDeviceInfo[]) => void): () => void {
  const media = navigator.mediaDevices
  if (!media?.enumerateDevices) return () => {}
  let active = true
  const refresh = () => {
    listAudioInputs()
      .then((devices) => {
        if (active) onChange(devices)
      })
      .catch(() => {})
  }
  refresh()
  media.addEventListener?.('devicechange', refresh)
  return () => {
    active = false
    media.removeEventListener?.('devicechange', refresh)
  }
}
