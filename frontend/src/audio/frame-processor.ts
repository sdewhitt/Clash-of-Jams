// Runs in AudioWorkletGlobalScope, whose globals are not in the DOM lib.
declare const currentTime: number
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void

export interface SampleBlock {
  samples: Float32Array
  /** AudioContext time of samples[0]. */
  time: number
}

/** Forwards every input block to the main thread, stamped on the audio clock. */
class FrameProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0]
    if (channel) {
      const block: SampleBlock = { samples: channel.slice(), time: currentTime }
      this.port.postMessage(block, [block.samples.buffer])
    }
    return true
  }
}

registerProcessor('frame-processor', FrameProcessor)
