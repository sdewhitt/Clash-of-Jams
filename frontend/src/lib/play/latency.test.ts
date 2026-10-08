/** Estimating input latency from a calibration take. */
import { describe, expect, it } from 'vitest'

import { estimateLatencyMs } from '@/lib/play/latency'

describe('estimateLatencyMs', () => {
  const clicks = [1, 1.75, 2.5, 3.25, 4, 4.75]

  it('returns the median delay between each click and its note', () => {
    const onsets = clicks.map((time, k) => time + 0.08 + (k === 2 ? 0.2 : 0))

    expect(estimateLatencyMs(clicks, onsets)).toBe(80)
  })

  it('ignores clicks nobody played on', () => {
    const onsets = clicks.slice(0, 4).map((time) => time + 0.05)

    expect(estimateLatencyMs(clicks, onsets)).toBe(50)
  })

  it('gives up when too few clicks were matched', () => {
    expect(estimateLatencyMs(clicks, [1.05, 1.8])).toBeNull()
  })

  it('never reports negative latency for a player who rushes', () => {
    expect(
      estimateLatencyMs(
        clicks,
        clicks.map((time) => time - 0.04),
      ),
    ).toBe(0)
  })
})
