/**
 * Playback mode (story #20): the tones planned for a scenario, and the note highway drawn for
 * it, across fifty distinct scenarios at the slowest, normal and fastest speeds.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  midiToHz,
  MIN_TONE_SECONDS,
  planPlayback,
  schedulePlayback,
  soundingNotes,
  velocityToGain,
} from '@/lib/play/playback'
import { MAX_SPEED, MIN_SPEED } from '@/lib/play/speed'
import { buildTimeline } from '@/lib/play/timeline'
import { NoteHighway } from '@/pages/play/NoteHighway'
import { FakeAudioContext } from '@/test/audio'
import { PLAYBACK_SCENARIOS } from '@/test/playback-scenarios'

const SPEEDS = [MIN_SPEED, 1, MAX_SPEED]
const START = 10

describe('planPlayback basics', () => {
  const timeline = buildTimeline({
    notes: [
      { index: 0, midiPitch: 69, startBeat: 0, durationBeats: 1, velocity: 127 },
      { index: 1, midiPitch: 60, startBeat: 1, durationBeats: 2, velocity: 64 },
    ],
    tempoMap: [{ atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 }],
  })

  it('sounds each note at its pitch, time, length and loudness', () => {
    expect(planPlayback(timeline, START)).toEqual([
      { time: 10, hz: 440, gain: velocityToGain(127), duration: 0.5, noteIndex: 0 },
      { time: 10.5, hz: midiToHz(60), gain: velocityToGain(64), duration: 1, noteIndex: 1 },
    ])
  })

  it('resumes from the middle, cutting a note already sounding to what remains', () => {
    // Resuming 1 s in: the first note is over, the second has 0.5 s left.
    const tones = planPlayback(timeline, START, 1000)
    expect(tones).toEqual([
      { time: 11, hz: midiToHz(60), gain: velocityToGain(64), duration: 0.5, noteIndex: 1 },
    ])
  })

  it('reports which notes are sounding at a position', () => {
    expect(soundingNotes(timeline, 250).map(({ note }) => note.index)).toEqual([0])
    expect(soundingNotes(timeline, 750).map(({ note }) => note.index)).toEqual([1])
    expect(soundingNotes(timeline, 5000)).toEqual([])
  })

  it('gives middle A 440 Hz and an octave double the frequency', () => {
    expect(midiToHz(69)).toBe(440)
    expect(midiToHz(81)).toBeCloseTo(880, 9)
  })
})

describe('schedulePlayback', () => {
  it('starts one voice per tone at its time, and can silence them all', () => {
    const context = new FakeAudioContext()
    const timeline = buildTimeline({
      notes: [
        { index: 0, midiPitch: 60, startBeat: 0, durationBeats: 1, velocity: 96 },
        { index: 1, midiPitch: 64, startBeat: 0, durationBeats: 1, velocity: 96 },
      ],
      tempoMap: [{ atBeat: 0, bpm: 60, timeSigNum: 4, timeSigDen: 4 }],
    })
    const silence = schedulePlayback(context as unknown as AudioContext, planPlayback(timeline, 2))

    expect(context.noteTones().map((tone) => [tone.frequency, tone.start])).toEqual([
      [midiToHz(60), 2],
      [midiToHz(64), 2],
    ])
    expect(() => silence()).not.toThrow()
  })
})

describe.each(PLAYBACK_SCENARIOS.map((scenario, i) => [i + 1, scenario.name, scenario] as const))(
  'scenario %i: %s',
  (_, __, scenario) => {
    it.each(SPEEDS)('plans a correct tone for every note at %sx', (speed) => {
      const timeline = buildTimeline({ ...scenario, speedMultiplier: speed })
      const tones = planPlayback(timeline, START)

      expect(tones).toHaveLength(scenario.notes.length)
      expect(new Set(tones.map((tone) => tone.noteIndex))).toEqual(
        new Set(scenario.notes.map((note) => note.index)),
      )
      tones.forEach((tone, i) => {
        const { note, startMs, endMs } = timeline.notes[i]
        expect(tone.noteIndex).toBe(note.index)
        expect(tone.time).toBeCloseTo(START + startMs / 1000, 9)
        expect(tone.duration).toBeCloseTo(Math.max(MIN_TONE_SECONDS, (endMs - startMs) / 1000), 9)
        expect(tone.hz).toBeCloseTo(440 * 2 ** ((note.midiPitch - 69) / 12), 6)
        expect(tone.gain).toBeGreaterThan(0)
        expect(tone.gain).toBeLessThanOrEqual(0.3)
        if (i > 0) expect(tone.time).toBeGreaterThanOrEqual(tones[i - 1].time)
      })
    })

    it('stretches and squeezes by exactly the speed ratio', () => {
      const normal = planPlayback(buildTimeline(scenario), 0)
      for (const speed of [MIN_SPEED, MAX_SPEED]) {
        const scaled = planPlayback(buildTimeline({ ...scenario, speedMultiplier: speed }), 0)
        scaled.forEach((tone, i) => {
          expect(tone.time).toBeCloseTo(normal[i].time / speed, 6)
          expect(tone.hz).toBe(normal[i].hz)
        })
      }
    })

    it('resumes halfway with only the notes still to come', () => {
      const timeline = buildTimeline(scenario)
      const half = timeline.endMs / 2
      const tones = planPlayback(timeline, START, half)
      const remaining = timeline.notes.filter(
        ({ startMs, endMs }) => endMs > half || startMs >= half,
      )

      expect(tones.map((tone) => tone.noteIndex)).toEqual(remaining.map(({ note }) => note.index))
      for (const tone of tones) expect(tone.time).toBeGreaterThanOrEqual(START + half / 1000 - 1e-9)
    })

    it('schedules every tone on the audio clock without throwing', () => {
      const context = new FakeAudioContext()
      const timeline = buildTimeline(scenario)
      schedulePlayback(context as unknown as AudioContext, planPlayback(timeline, 1))
      expect(context.noteTones()).toHaveLength(scenario.notes.length)
    })

    it('draws every note on the note highway, in time order', () => {
      const timeline = buildTimeline(scenario)
      render(<NoteHighway timeline={timeline} getPositionMs={() => 0} />)
      const highway = screen.getByTestId('note-highway')
      const blocks = Array.from(highway.querySelectorAll<HTMLElement>('div.rounded.border'))

      expect(blocks).toHaveLength(scenario.notes.length)
      const lefts = blocks.map((block) => parseFloat(block.style.left))
      for (let i = 1; i < lefts.length; i++) expect(lefts[i]).toBeGreaterThanOrEqual(lefts[i - 1])
      for (const block of blocks) {
        expect(parseFloat(block.style.width)).toBeGreaterThan(0)
        expect(Number.isFinite(parseFloat(block.style.top))).toBe(true)
      }
    })
  },
)

it('has fifty distinct scenarios', () => {
  expect(PLAYBACK_SCENARIOS).toHaveLength(50)
  expect(new Set(PLAYBACK_SCENARIOS.map((scenario) => scenario.name)).size).toBe(50)
})
