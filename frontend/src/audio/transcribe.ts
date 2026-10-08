import { FrameAnalyzer, type AnalyzerOptions } from './analysis'
import { NoteSegmenter, type DetectedNote, type SegmenterOptions } from './segmenter'

export interface TranscribeOptions {
  analyzer?: Partial<AnalyzerOptions>
  segmenter?: Partial<SegmenterOptions>
}

/** Transcribes a whole mono buffer. Note times are seconds from the buffer's first sample. */
export function transcribe(
  samples: Float32Array,
  sampleRate: number,
  options: TranscribeOptions = {},
): DetectedNote[] {
  const analyzer = new FrameAnalyzer(sampleRate, options.analyzer)
  const segmenter = new NoteSegmenter({ pitchLagMs: analyzer.pitchLagMs, ...options.segmenter })
  const notes: DetectedNote[] = []
  for (const frame of analyzer.push(samples, 0)) notes.push(...segmenter.push(frame))
  notes.push(...segmenter.flush())
  return notes
}

/** Mixes an AudioBuffer (a decoded recording) down to mono. */
export function toMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c)
    for (let i = 0; i < mono.length; i++) mono[i] += channel[i] / buffer.numberOfChannels
  }
  return mono
}
