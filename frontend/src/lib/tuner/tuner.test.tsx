/**
 * The tuner (story #15): note and cents arithmetic, detuned and in-tune audio through the same
 * pitch detector gameplay uses, a hundred pitches through the display, and MIDI exactness.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FrameAnalyzer } from '@/audio/analysis'
import { PIANO_PROFILE } from '@/audio/instruments'
import { TunerDisplay } from '@/components/TunerDisplay'
import {
  clampA4,
  formatCents,
  needlePercent,
  PitchSmoother,
  readHz,
  readMidi,
  tuningStatus,
} from '@/lib/tuner/tuner'

const SAMPLE_RATE = 48000

/** A plucked-string-like tone: a few harmonics with a soft attack. */
function tone(hz: number, seconds = 0.6): Float32Array {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  const harmonics = [1, 0.5, 0.3, 0.2].filter((_, h) => hz * (h + 1) < SAMPLE_RATE * 0.45)
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE
    let sample = 0
    harmonics.forEach((amp, h) => (sample += amp * Math.sin(2 * Math.PI * hz * (h + 1) * t)))
    out[i] = 0.3 * Math.min(1, t / 0.01) * sample
  }
  return out
}

/** Runs audio through the analyzer and smoother exactly as the tuner page does. */
function tunerReads(hz: number) {
  const analyzer = new FrameAnalyzer(SAMPLE_RATE, PIANO_PROFILE.analyzer)
  const smoother = new PitchSmoother()
  let shown: number | null = null
  for (const frame of analyzer.push(tone(hz), 0)) {
    shown = smoother.push(frame.midi, frame.clarity, frame.time * 1000)
  }
  return shown === null ? null : readMidi(shown)
}

describe('readHz', () => {
  it('reads A440 as A4, perfectly in tune', () => {
    expect(readHz(440)).toMatchObject({
      noteName: 'A4',
      targetMidi: 69,
      targetHz: 440,
      cents: 0,
      status: 'in_tune',
    })
  })

  it('reads a sharp and a flat note against the nearest note', () => {
    const sharp = readHz(440 * 2 ** (20 / 1200))!
    expect(sharp).toMatchObject({ noteName: 'A4', cents: 20, status: 'sharp' })
    const flat = readHz(261.63 * 2 ** (-30 / 1200))!
    expect(flat.noteName).toBe('C4')
    expect(flat.cents).toBeCloseTo(-30, 0)
    expect(flat.status).toBe('flat')
  })

  it('flips to the next note past 50 cents', () => {
    expect(readHz(440 * 2 ** (51 / 1200))!.noteName).toBe('A#4')
  })

  it('reads against another reference A4', () => {
    expect(readHz(442, 442)).toMatchObject({ noteName: 'A4', cents: 0 })
    // 1200 × log2(440 / 442) = -7.85, shown to a tenth of a cent.
    expect(readHz(440, 442)!.cents).toBe(-7.9)
  })

  it('gives no reading for silence or nonsense', () => {
    expect(readHz(0)).toBeNull()
    expect(readHz(-5)).toBeNull()
    expect(readHz(Number.NaN)).toBeNull()
    expect(readHz(1)).toBeNull()
  })
})

describe('display helpers', () => {
  it('calls within 5 cents in tune', () => {
    expect(tuningStatus(4.9)).toBe('in_tune')
    expect(tuningStatus(-5)).toBe('in_tune')
    expect(tuningStatus(-5.1)).toBe('flat')
    expect(tuningStatus(6)).toBe('sharp')
  })

  it('places the needle across the dial and keeps it on the dial', () => {
    expect(needlePercent(0)).toBe(50)
    expect(needlePercent(-50)).toBe(0)
    expect(needlePercent(25)).toBe(75)
    expect(needlePercent(400)).toBe(100)
  })

  it('formats cents with a sign', () => {
    expect(formatCents(12.4)).toBe('+12 cents')
    expect(formatCents(-7.6)).toBe('−8 cents')
    expect(formatCents(0.2)).toBe('0 cents')
  })

  it('keeps the reference A4 within 415-466 Hz', () => {
    expect(clampA4(300)).toBe(415)
    expect(clampA4(500)).toBe(466)
    expect(clampA4(Number.NaN)).toBe(440)
  })
})

describe('PitchSmoother', () => {
  it('takes the median, so one wild frame does not move the needle', () => {
    const smoother = new PitchSmoother({ windowFrames: 5 })
    for (const midi of [69, 69.01, 69.4, 68.99, 69]) smoother.push(midi, 0.95, 0)
    expect(smoother.push(69, 0.95, 0)).toBeCloseTo(69, 1)
  })

  it('starts over when the note changes', () => {
    const smoother = new PitchSmoother()
    for (let i = 0; i < 5; i++) smoother.push(60, 0.95, i)
    expect(smoother.push(64, 0.95, 6)).toBe(64)
  })

  it('ignores unclear frames, holds briefly, then clears', () => {
    const smoother = new PitchSmoother({ holdMs: 500 })
    smoother.push(60, 0.95, 0)
    expect(smoother.push(72, 0.2, 100)).toBe(60)
    expect(smoother.push(null, 0, 400)).toBe(60)
    expect(smoother.push(null, 0, 700)).toBeNull()
  })
})

describe('tuning audio through the pitch detector', () => {
  const NOTES: [string, number][] = [
    ['E2 (low E string)', 82.41],
    ['A2', 110],
    ['D3', 146.83],
    ['G3', 196],
    ['B3', 246.94],
    ['E4 (high E string)', 329.63],
    ['A4', 440],
    ['C6', 1046.5],
  ]

  it.each(NOTES)('reads an in-tune %s as in tune', (_, hz) => {
    const reading = tunerReads(hz)!
    expect(reading).not.toBeNull()
    expect(Math.abs(reading.cents)).toBeLessThanOrEqual(2)
    expect(reading.status).toBe('in_tune')
  })

  it.each([-40, -25, -12, 12, 25, 40])('reads A2 detuned by %i cents within 2 cents', (cents) => {
    const reading = tunerReads(110 * 2 ** (cents / 1200))!
    expect(reading.noteName).toBe('A2')
    expect(Math.abs(reading.cents - cents)).toBeLessThanOrEqual(2)
    expect(reading.status).toBe(cents < 0 ? 'flat' : 'sharp')
  })

  it.each([-20, 15])('reads E4 detuned by %i cents within 2 cents', (cents) => {
    const reading = tunerReads(329.63 * 2 ** (cents / 1200))!
    expect(reading.noteName).toBe('E4')
    expect(Math.abs(reading.cents - cents)).toBeLessThanOrEqual(2)
  })

  it('shows nothing for silence', () => {
    expect(tunerReads(0)).toBeNull()
  })
})

describe('MIDI controller', () => {
  it('reads every MIDI note perfectly in tune at A4 = 440 Hz', () => {
    for (let note = 0; note <= 127; note++) {
      const reading = readMidi(note)!
      expect(reading.targetMidi).toBe(note)
      expect(reading.cents).toBe(0)
      expect(reading.status).toBe('in_tune')
    }
  })
})

describe('TunerDisplay', () => {
  it('prompts for a note before one is heard', () => {
    render(<TunerDisplay reading={null} a4Hz={440} />)
    expect(screen.getByTestId('tuner-note')).toHaveTextContent('—')
    expect(screen.getByRole('meter', { name: 'Cents from target' })).toHaveTextContent(
      'Play a note',
    )
    expect(screen.queryByTestId('tuner-needle')).not.toBeInTheDocument()
  })

  it('stays clear and readable across a hundred pitches', () => {
    for (let i = 0; i < 100; i++) {
      // Every semitone from E1 up, detuned by a different amount each time.
      const midi = 28 + i * 0.73
      const reading = readMidi(midi)!
      const { unmount } = render(<TunerDisplay reading={reading} a4Hz={440} />)

      const note = screen.getByTestId('tuner-note')
      expect(note.textContent).toMatch(/^[A-G]#?$/)
      expect(screen.getByRole('status', { name: 'Detected note' }).textContent).toBe(
        reading.noteName,
      )
      const needle = parseFloat(screen.getByTestId('tuner-needle').style.left)
      expect(needle).toBeGreaterThanOrEqual(0)
      expect(needle).toBeLessThanOrEqual(100)
      expect(needle).toBeCloseTo(needlePercent(reading.cents), 6)
      const meter = screen.getByRole('meter', { name: 'Cents from target' })
      expect(meter).toHaveAttribute('aria-valuenow', String(Math.round(reading.cents)))
      expect(meter.textContent).toMatch(/cents · (In tune|Flat · tune up|Sharp · tune down)$/)
      expect(screen.getByText(`${reading.hz.toFixed(1)} Hz`)).toBeInTheDocument()
      expect(
        screen.getByText(`${reading.noteName} · ${reading.targetHz.toFixed(1)} Hz`),
      ).toBeInTheDocument()
      unmount()
    }
  })
})
