/**
 * Keeps one audio input open for as long as a screen wants it, through the interruptions a
 * tuner or level check has to survive: the interface being unplugged and plugged back in, the
 * player switching inputs, and the browser suspending audio.
 *
 * While a chosen interface is unplugged it can fall back to the default input, and it moves
 * back as soon as the interface returns.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { AudioFrame, AnalyzerOptions } from './analysis'
import { findDevice, isDevicePresent, watchAudioInputs, type AudioInputChoice } from './devices'
import { openAudioInput, type AudioInput } from './input'
import type { InputLevel } from './level'

export type LiveInputStatus =
  /** Not asked to listen. */
  | 'off'
  | 'starting'
  | 'live'
  /** Listening on the default input because the chosen one is unplugged. */
  | 'fallback'
  /** The chosen input is unplugged and there is nothing to fall back to. */
  | 'disconnected'
  | 'error'

interface LiveAudioInputOptions {
  enabled: boolean
  choice: AudioInputChoice
  analyzer?: Partial<AnalyzerOptions>
  onFrame?: (frame: AudioFrame) => void
  /** Listen on the default input while the chosen one is unplugged. */
  fallbackToDefault?: boolean
}

/** Retry an input that dropped without being unplugged (an OS hiccup) after this long. */
const RETRY_MS = 1000

export function useLiveAudioInput({
  enabled,
  choice,
  analyzer,
  onFrame,
  fallbackToDefault = true,
}: LiveAudioInputOptions) {
  const [devices, setDevices] = useState<MediaDeviceInfo[] | null>(null)
  /** How the latest open attempt went, keyed so a stale attempt never reports for a new one. */
  const [outcome, setOutcome] = useState<{
    key: string
    status: Exclude<LiveInputStatus, 'off' | 'starting'>
    error: string | null
  } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const input = useRef<AudioInput | null>(null)
  const frameHandler = useRef(onFrame)
  const analyzerOptions = useRef(analyzer)
  useEffect(() => {
    frameHandler.current = onFrame
    analyzerOptions.current = analyzer
  })

  useEffect(() => (enabled ? watchAudioInputs(setDevices) : undefined), [enabled])

  // Before the device list arrives, trust the saved id; afterwards, only what is plugged in.
  const resolved = devices === null ? choice.deviceId : findDevice(devices, choice)
  const chosenPresent =
    choice.deviceId === null ||
    devices === null ||
    (resolved !== null && isDevicePresent(devices, resolved))
  const usingFallback = !chosenPresent && fallbackToDefault
  const deviceId = chosenPresent ? resolved : null
  const channel = chosenPresent ? choice.channel : null
  const shouldOpen = enabled && (chosenPresent || fallbackToDefault)
  const key = `${deviceId}|${channel}|${usingFallback}|${attempt}`

  let status: LiveInputStatus = 'starting'
  if (!enabled) status = 'off'
  else if (!shouldOpen) status = 'disconnected'
  else if (outcome?.key === key) status = outcome.status
  const error = enabled && outcome?.key === key ? outcome.error : null

  // Something was plugged in or out: an input that failed or dropped gets another try.
  const statusNow = useRef(status)
  useEffect(() => {
    statusNow.current = status
  })
  const deviceKey = devices?.map((device) => device.deviceId).join('|') ?? null
  const previousDeviceKey = useRef(deviceKey)
  useEffect(() => {
    const previous = previousDeviceKey.current
    previousDeviceKey.current = deviceKey
    // The first list is not a change; only a plug or unplug after it is.
    if (previous === null || previous === deviceKey) return
    if (statusNow.current === 'error' || statusNow.current === 'disconnected') {
      setAttempt((n) => n + 1)
    }
  }, [deviceKey])

  useEffect(() => {
    if (!shouldOpen) return
    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | undefined

    openAudioInput({
      deviceId: deviceId ?? undefined,
      channel: channel ?? undefined,
      analyzer: analyzerOptions.current,
      onFrame: (frame) => frameHandler.current?.(frame),
      onEnded: () => {
        if (cancelled) return
        setOutcome({ key, status: 'disconnected', error: null })
        // If it was unplugged, the device list changes and this effect reruns on its own.
        retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS)
      },
    })
      .then((opened) => {
        if (cancelled) {
          void opened.stop()
          return
        }
        input.current = opened
        setOutcome({ key, status: usingFallback ? 'fallback' : 'live', error: null })
        // A context the browser suspends (another tab, a call) is resumed on the next gesture.
        opened.context.onstatechange = () => {
          if (opened.context.state !== 'running' && opened.context.state !== 'closed') {
            void opened.context.resume().catch(() => {})
          }
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setOutcome({ key, status: 'error', error: describeInputError(e) })
      })

    return () => {
      cancelled = true
      clearTimeout(retry)
      const current = input.current
      input.current = null
      if (current) {
        current.context.onstatechange = null
        void current.stop()
      }
    }
  }, [shouldOpen, deviceId, channel, usingFallback, key])

  // Browsers only let a suspended context resume from a gesture, so listen for one.
  useEffect(() => {
    if (!enabled) return
    const resume = () => {
      const context = input.current?.context
      if (context && context.state === 'suspended') void context.resume().catch(() => {})
    }
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
  }, [enabled])

  const getLevel = useCallback((): InputLevel | null => {
    const current = input.current
    return current && current.isLive() ? current.readLevel() : null
  }, [])

  const isSuspended = useCallback(() => input.current?.context.state === 'suspended', [])

  return {
    status,
    error,
    devices: devices ?? [],
    getLevel,
    isSuspended,
    retry: () => setAttempt((n) => n + 1),
  }
}

export function describeInputError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Microphone access was blocked. Allow it for this site, then try again.'
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'No microphone or audio interface was found.'
  }
  if (error instanceof DOMException && error.name === 'OverconstrainedError') {
    return 'That device could not be opened with the chosen input. Pick another input.'
  }
  return error instanceof Error ? error.message : 'Could not open the audio input.'
}
