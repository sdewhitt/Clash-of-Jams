/** Metronome clicks, scheduled ahead on the audio clock so they stay sample-accurate. */

export interface ScheduledClick {
  /** AudioContext time, in seconds. */
  time: number
  accent: boolean
}

/** Schedules every click now and returns a function that silences the ones still to come. */
export function scheduleClicks(
  context: AudioContext,
  clicks: ScheduledClick[],
  volume = 0.2,
): () => void {
  const master = context.createGain()
  master.connect(context.destination)

  for (const { time, accent } of clicks) {
    const osc = context.createOscillator()
    const gain = context.createGain()
    osc.frequency.value = accent ? 1760 : 1320
    gain.gain.setValueAtTime(volume, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03)
    osc.connect(gain).connect(master)
    osc.start(time)
    osc.stop(time + 0.04)
  }

  return () => master.disconnect()
}
