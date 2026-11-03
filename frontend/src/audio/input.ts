import { FrameAnalyzer, type AnalyzerOptions, type AudioFrame } from './analysis'
import type { SampleBlock } from './frame-processor'
import processorUrl from './frame-processor.ts?worker&url'
import { measureLevel, type InputLevel } from './level'
import { NoteSegmenter, type DetectedNote, type SegmenterOptions } from './segmenter'

export interface AudioInputOptions {
  /** A device from listAudioInputs(); the browser default when omitted. */
  deviceId?: string
  /**
   * Which input of the device to analyze, from 0. Omitted, the browser mixes the device down to
   * one channel. Given, only that channel is heard, so an unused input has no effect.
   */
  channel?: number
  /** Share the Gameplay Engine's context so notes and playback use one clock. */
  context?: AudioContext
  analyzer?: Partial<AnalyzerOptions>
  segmenter?: Partial<SegmenterOptions>
  onFrame?: (frame: AudioFrame) => void
  onNote?: (note: DetectedNote) => void
  /** The device went away: unplugged, or its permission revoked. Notes so far are kept. */
  onEnded?: () => void
}

export interface AudioInput {
  readonly context: AudioContext
  /** What the browser applied; some devices ignore requests to disable processing. */
  readonly settings: MediaTrackSettings
  /** The channel being analyzed, or null when the device is mixed down. */
  readonly channel: number | null
  /** Returns every note since the last call, ending any note still sounding. */
  takeNotes(): DetectedNote[]
  /** The level of the most recent block of the analyzed channel. */
  readLevel(): InputLevel
  /** False once the device has been unplugged. */
  isLive(): boolean
  stop(): Promise<void>
}

const loadedContexts = new WeakSet<BaseAudioContext>()
/** Samples the level meter reads at a time; about 46 ms at 44.1 kHz. */
const METER_SAMPLES = 2048

/** Lists microphones. Labels are empty until the user has granted permission once. */
export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'audioinput')
}

function channelConstraint(channel: number | undefined): MediaTrackConstraints['channelCount'] {
  return channel === undefined ? 1 : { ideal: Math.max(2, channel + 1) }
}

/**
 * Opens the microphone and starts detecting notes. Call from a user gesture: browsers keep an
 * AudioContext suspended until one.
 */
export async function openAudioInput(options: AudioInputOptions = {}): Promise<AudioInput> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone input needs a secure context (https or localhost).')
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
      // Voice processing rides the level and smears attacks, which erases dynamics and onsets.
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: channelConstraint(options.channel),
    },
  })
  const track = stream.getAudioTracks()[0]
  const settings = track.getSettings()
  const ownsContext = !options.context
  const context = options.context ?? new AudioContext({ latencyHint: 'interactive' })

  const available = settings.channelCount ?? 1
  const channel = options.channel ?? null
  if (channel !== null && channel >= available) {
    stream.getTracks().forEach((t) => t.stop())
    if (ownsContext) await context.close()
    throw new Error(
      `Input ${channel + 1} is not available: this device gives the browser ${available} ` +
        `input${available === 1 ? '' : 's'}.`,
    )
  }

  try {
    await context.resume()
    if (!loadedContexts.has(context)) {
      await context.audioWorklet.addModule(processorUrl)
      loadedContexts.add(context)
    }
  } catch (error) {
    stream.getTracks().forEach((t) => t.stop())
    if (ownsContext) await context.close()
    throw error
  }

  const source = context.createMediaStreamSource(stream)
  // One mono signal feeds both detection and the meter: the chosen channel, or the mixdown.
  let signal: AudioNode = source
  let splitter: ChannelSplitterNode | null = null
  if (channel !== null) {
    splitter = context.createChannelSplitter(Math.max(available, channel + 1))
    source.connect(splitter)
    const picked = context.createGain()
    splitter.connect(picked, channel)
    signal = picked
  }

  const node = new AudioWorkletNode(context, 'frame-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
    channelCount: 1,
    channelCountMode: 'explicit',
  })
  signal.connect(node)

  const meter = context.createAnalyser()
  meter.fftSize = METER_SAMPLES
  const meterSamples = new Float32Array(METER_SAMPLES)
  signal.connect(meter)

  const analyzer = new FrameAnalyzer(context.sampleRate, options.analyzer)
  const segmenter = new NoteSegmenter({ pitchLagMs: analyzer.pitchLagMs, ...options.segmenter })
  let notes: DetectedNote[] = []
  const collect = (detected: DetectedNote[]) => {
    for (const note of detected) {
      notes.push(note)
      options.onNote?.(note)
    }
  }

  node.port.onmessage = ({ data }: MessageEvent<SampleBlock>) => {
    for (const frame of analyzer.push(data.samples, data.time)) {
      options.onFrame?.(frame)
      collect(segmenter.push(frame))
    }
  }

  let stopped = false
  let live = true
  const onTrackEnded = () => {
    if (stopped || !live) return
    live = false
    // Whatever was sounding when the cable came out ends there.
    collect(segmenter.flush())
    options.onEnded?.()
  }
  track.addEventListener('ended', onTrackEnded)

  return {
    context,
    settings,
    channel,
    takeNotes() {
      collect(segmenter.flush())
      const taken = notes
      notes = []
      return taken
    },
    readLevel() {
      meter.getFloatTimeDomainData(meterSamples)
      return measureLevel(meterSamples)
    },
    isLive() {
      return live
    },
    async stop() {
      if (stopped) return
      stopped = true
      track.removeEventListener('ended', onTrackEnded)
      node.port.onmessage = null
      source.disconnect()
      splitter?.disconnect()
      signal.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      if (ownsContext) await context.close()
    },
  }
}
