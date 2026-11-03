import { describe, expect, it } from 'vitest'

import { gainAdvice, LevelHold, levelToPercent, measureLevel, SILENT_LEVEL } from './level'

describe('measureLevel', () => {
  it('measures RMS and peak in dBFS', () => {
    const level = measureLevel(new Float32Array(512).fill(0.5))
    expect(level.rmsDb).toBeCloseTo(-6.02, 2)
    expect(level.peakDb).toBeCloseTo(-6.02, 2)
    expect(level.clipped).toBe(false)
  })

  it('flags a block that reaches full scale as clipped', () => {
    const samples = new Float32Array(512).fill(0.1)
    samples[100] = -1
    expect(measureLevel(samples)).toMatchObject({ clipped: true, peakDb: 0 })
  })

  it('reads silence at the floor', () => {
    expect(measureLevel(new Float32Array(256))).toEqual(SILENT_LEVEL)
    expect(measureLevel([])).toEqual(SILENT_LEVEL)
  })
})

describe('meter scale and advice', () => {
  it('maps -60..0 dBFS onto the bar', () => {
    expect(levelToPercent(-60)).toBe(0)
    expect(levelToPercent(-30)).toBe(50)
    expect(levelToPercent(0)).toBe(100)
    expect(levelToPercent(-120)).toBe(0)
    expect(levelToPercent(6)).toBe(100)
  })

  it('tells the player which way to turn the gain', () => {
    expect(gainAdvice(-70, false)).toBe('silent')
    expect(gainAdvice(-40, false)).toBe('too_quiet')
    expect(gainAdvice(-12, false)).toBe('good')
    expect(gainAdvice(-1, false)).toBe('hot')
    expect(gainAdvice(-1, true)).toBe('clipping')
  })
})

describe('LevelHold', () => {
  it('keeps the clip light on for the hold time after a clip', () => {
    const hold = new LevelHold(1000)
    hold.update({ rmsDb: -3, peakDb: 0, clipped: true }, 0)
    expect(hold.update({ rmsDb: -30, peakDb: -24, clipped: false }, 500).clipping).toBe(true)
    expect(hold.update({ rmsDb: -30, peakDb: -24, clipped: false }, 1500).clipping).toBe(false)
  })

  it('holds the recent peak, then follows the level down', () => {
    const hold = new LevelHold(1000)
    hold.update({ rmsDb: -10, peakDb: -6, clipped: false }, 0)
    expect(hold.update({ rmsDb: -30, peakDb: -20, clipped: false }, 500).peakDb).toBe(-6)
    expect(hold.update({ rmsDb: -30, peakDb: -20, clipped: false }, 1200).peakDb).toBe(-20)
  })
})
