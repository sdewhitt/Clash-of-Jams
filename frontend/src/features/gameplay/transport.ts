/**
 * The gameplay clock.
 *
 * Everything timed during a scenario reads from here, and this reads from
 * `AudioContext.currentTime` rather than `performance.now()` or a frame count.
 * The audio clock is the only one that stays locked to actual sample playback,
 * so it is the only one that will not drift against the backing track over a
 * ninety-second scenario.
 *
 * Deliberately not a React construct: nothing in here should trigger a render.
 */
export class Transport {
  private context: AudioContext | null = null
  /** Context time at which position 0 occurred. */
  private originSec = 0
  /** Position held while paused. */
  private heldSec = 0
  private running = false

  /**
   * Must be called from a user gesture — browsers refuse to start an
   * AudioContext otherwise, which is why gameplay needs an explicit "start"
   * click rather than auto-playing on mount.
   */
  async start(): Promise<void> {
    this.context ??= new AudioContext()
    if (this.context.state === 'suspended') {
      await this.context.resume()
    }
    this.originSec = this.context.currentTime - this.heldSec
    this.running = true
  }

  pause(): void {
    if (!this.running) return
    this.heldSec = this.position
    this.running = false
  }

  reset(): void {
    this.heldSec = 0
    this.originSec = this.context?.currentTime ?? 0
    this.running = false
  }

  /** Seconds elapsed since the scenario started. */
  get position(): number {
    if (!this.running || !this.context) return this.heldSec
    return this.context.currentTime - this.originSec
  }

  get isRunning(): boolean {
    return this.running
  }

  /** The shared context, for the input chain and playback to hang off of. */
  get audioContext(): AudioContext | null {
    return this.context
  }

  async dispose(): Promise<void> {
    this.running = false
    await this.context?.close()
    this.context = null
  }
}
