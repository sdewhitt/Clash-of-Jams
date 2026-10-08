/**
 * Input latency calibration: the player plays along with a run of clicks, and the typical gap
 * between each click and the note detected for it is the delay to subtract from every onset.
 *
 * That gap covers the whole loop -- output latency, the instrument, the microphone and the
 * detector -- which is exactly what toPerformedNotes' latencyMs stands for.
 */

/** Fewer matched clicks than this is too little to trust. */
const MIN_MATCHES = 4
export const MAX_LATENCY_MS = 500

/**
 * `clickTimes` and `onsets` are AudioContext times in seconds. Returns the median delay in whole
 * milliseconds, or null when too few clicks had a note near them.
 */
export function estimateLatencyMs(clickTimes: number[], onsets: number[]): number | null {
  if (clickTimes.length < 2) return null
  // A note belongs to the click it is nearest, so look half an interval either side.
  const reach = (clickTimes[1] - clickTimes[0]) / 2

  const delays: number[] = []
  for (const click of clickTimes) {
    let nearest: number | null = null
    for (const onset of onsets) {
      const delay = onset - click
      if (Math.abs(delay) >= reach) continue
      if (nearest === null || Math.abs(delay) < Math.abs(nearest)) nearest = delay
    }
    if (nearest !== null) delays.push(nearest * 1000)
  }
  if (delays.length < MIN_MATCHES) return null

  delays.sort((a, b) => a - b)
  const mid = delays.length >> 1
  const median = delays.length % 2 ? delays[mid] : (delays[mid - 1] + delays[mid]) / 2
  // A player who anticipates the click measures early; latency itself is never negative.
  return Math.min(MAX_LATENCY_MS, Math.max(0, Math.round(median)))
}
