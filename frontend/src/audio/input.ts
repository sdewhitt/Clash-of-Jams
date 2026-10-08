import { FrameAnalyzer, type AnalyzerOptions, type AudioFrame } from './analysis'
import type { SampleBlock } from './frame-processor'
import processorUrl from './frame-processor.ts?worker&url'
import { NoteSegmenter, type DetectedNote, type SegmenterOptions } from './segmenter'

export interface AudioInputOptions {
  /** A device from listAudioInputs(); the browser default when omitted. */
  deviceId?: string
  /** Share the Gameplay Engine's context so notes and playback use one clock. */
  context?: AudioContext
  analyzer?: Partial<AnalyzerOptions>
  segmenter?: Partial<SegmenterOptions>
  onFrame?: (frame: AudioFrame) => void
  onNote?: (note: DetectedNote) => void
}

export interface AudioInput {
  readonly context: AudioContext
  /** What the browser applied; some devices ignore requests to disable processing. */
  readonly settings: MediaTrackSettings
  /** Returns every note since the last call, ending any note still sounding. */
  takeNotes(): DetectedNote[]
  stop(): Promise<void>
}

const loadedContexts = new WeakSet<BaseAudioContext>()

/** Lists microphones. Labels are empty until the user has granted permission once. */
export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'audioinput')
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
      channelCount: 1,
    },
  })
  const ownsContext = !options.context
  const context = options.context ?? new AudioContext({ latencyHint: 'interactive' })

  try {
    await context.resume()
    if (!loadedContexts.has(context)) {
      await context.audioWorklet.addModule(processorUrl)
      loadedContexts.add(context)
    }
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop())
    if (ownsContext) await context.close()
    throw error
  }

  const source = context.createMediaStreamSource(stream)
  const node = new AudioWorkletNode(context, 'frame-processor', {
    numberOfInputs: 1,
    numberOfOutputs: 0,
  })
  source.connect(node)

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
  return {
    context,
    settings: stream.getAudioTracks()[0].getSettings(),
    takeNotes() {
      collect(segmenter.flush())
      const taken = notes
      notes = []
      return taken
    },
    async stop() {
      if (stopped) return
      stopped = true
      node.port.onmessage = null
      source.disconnect()
      stream.getTracks().forEach((track) => track.stop())
      if (ownsContext) await context.close()
    },
  }
}
