/**
 * Picks the audio interface (or microphone) to play through, and which of its inputs the
 * instrument is plugged into.
 */
import { useEffect, useState } from 'react'

import {
  countInputChannels,
  deviceLabel,
  findDevice,
  inputLabel,
  watchAudioInputs,
  type AudioInputChoice,
} from '@/audio/devices'
import { listAudioInputs } from '@/audio/input'

/** Chrome lists these pseudo-devices beside the real ones; "System default" stands for them. */
const PSEUDO_DEVICES = new Set(['default', 'communications'])

interface AudioInputPickerProps {
  value: AudioInputChoice
  onChange: (choice: AudioInputChoice) => void
  disabled?: boolean
  labelClass?: string
  controlClass?: string
}

export function AudioInputPicker({
  value,
  onChange,
  disabled = false,
  labelClass = 'flex flex-col gap-1 text-sm font-semibold text-ink',
  controlClass = 'w-full rounded-lg border-2 border-accent-start bg-white px-3 py-2 text-black',
}: AudioInputPickerProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  /** Until the device can be asked, assume a stereo pair, the most common interface layout. */
  const [channels, setChannels] = useState(2)

  useEffect(() => watchAudioInputs(setDevices), [])

  const real = devices.filter((device) => !PSEUDO_DEVICES.has(device.deviceId))
  const current = findDevice(real, value)
  const missing = value.deviceId !== null && current === null && real.length > 0
  const needsPermission = real.length > 0 && real.every((device) => !device.label)
  // Counting opens the device, which would prompt for permission; wait until it is granted.
  const permitted = real.some((device) => device.label)

  useEffect(() => {
    if (!permitted) return
    let cancelled = false
    void countInputChannels(current).then((count) => {
      if (!cancelled) setChannels(count)
    })
    return () => {
      cancelled = true
    }
  }, [current, permitted])

  async function allowAccess() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      setDevices(await listAudioInputs())
    } catch {
      // The picker keeps working with unlabeled devices.
    }
  }

  // A saved input the device no longer offers is still shown, so the choice is not lost silently.
  const channelCount = Math.max(channels, value.channel !== null ? value.channel + 1 : 0)

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="grid grid-cols-2 gap-4">
        <label className={labelClass}>
          Audio device
          <select
            value={current ?? ''}
            disabled={disabled}
            onChange={(e) => {
              const id = e.target.value || null
              const device = real.find((candidate) => candidate.deviceId === id)
              onChange({ deviceId: id, deviceLabel: device?.label || null, channel: null })
            }}
            className={controlClass}
          >
            <option value="">System default</option>
            {real.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {deviceLabel(device, index)}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Input channel
          <select
            value={value.channel === null ? '' : String(value.channel)}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...value,
                deviceId: current,
                channel: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            className={controlClass}
          >
            <option value="">{inputLabel(null)}</option>
            {Array.from({ length: channelCount }, (_, channel) => (
              <option key={channel} value={channel}>
                {inputLabel(channel)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {missing && (
        <p className="text-sm text-yellow-400">
          {value.deviceLabel ?? 'Your saved audio device'} is not plugged in. Using the system
          default until it is.
        </p>
      )}
      {needsPermission && (
        <button
          type="button"
          onClick={() => void allowAccess()}
          className="self-start text-sm font-semibold text-ink underline"
        >
          Allow audio access to see device names
        </button>
      )}
    </div>
  )
}
