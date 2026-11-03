/**
 * Fifty distinct scenarios for exercising playback, weighted toward the charts most likely to
 * break it: chords, tempo and meter changes, extreme pitches and tempos, zero-length and
 * overlapping notes, notes out of order, and very long charts.
 */
import type { ExpectedNote, TempoMapEntry } from '@/lib/schema/types'

export interface PlaybackScenario {
  name: string
  notes: ExpectedNote[]
  tempoMap: TempoMapEntry[]
}

const tempo = (atBeat: number, bpm: number, timeSigNum = 4, timeSigDen = 4): TempoMapEntry => ({
  atBeat,
  bpm,
  timeSigNum,
  timeSigDen,
})

/** Notes from [pitch, startBeat, durationBeats, velocity?] tuples, indexed in order. */
function notes(spec: [number, number, number, number?][]): ExpectedNote[] {
  return spec.map(([midiPitch, startBeat, durationBeats, velocity = 96], index) => ({
    index,
    midiPitch,
    startBeat,
    durationBeats,
    velocity,
  }))
}

/** A run of equal notes, one after another. */
function run(pitches: number[], beats = 1, from = 0): [number, number, number][] {
  return pitches.map((pitch, i) => [pitch, from + i * beats, beats])
}

function chord(pitches: number[], at: number, beats: number): [number, number, number][] {
  return pitches.map((pitch) => [pitch, at, beats])
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A seeded random chart: melody, occasional chords, and random tempo changes. */
function randomScenario(seed: number, count: number): PlaybackScenario {
  const rand = mulberry32(seed)
  const spec: [number, number, number, number][] = []
  let beat = 0
  for (let i = 0; i < count; i++) {
    const duration = [0.25, 0.5, 1, 1.5, 2][Math.floor(rand() * 5)]
    const pitch = 36 + Math.floor(rand() * 48)
    spec.push([pitch, beat, duration, 20 + Math.floor(rand() * 107)])
    if (rand() < 0.15) spec.push([pitch + 4, beat, duration, 80], [pitch + 7, beat, duration, 80])
    beat += duration
  }
  const tempoMap = [tempo(0, 60 + Math.floor(rand() * 120))]
  for (let at = 8; at < beat; at += 8 + Math.floor(rand() * 8)) {
    tempoMap.push(tempo(at, 40 + Math.floor(rand() * 200), rand() < 0.3 ? 3 : 4))
  }
  return { name: `random chart (seed ${seed})`, notes: notes(spec), tempoMap }
}

const C_MAJOR = [60, 62, 64, 65, 67, 69, 71, 72]

export const PLAYBACK_SCENARIOS: PlaybackScenario[] = [
  { name: 'single note', notes: notes([[60, 0, 1]]), tempoMap: [tempo(0, 120)] },
  { name: 'C major scale', notes: notes(run(C_MAJOR)), tempoMap: [tempo(0, 100)] },
  { name: 'triad', notes: notes(chord([60, 64, 67], 0, 2)), tempoMap: [tempo(0, 90)] },
  {
    name: 'ten-note cluster chord',
    notes: notes(chord([48, 52, 55, 59, 60, 62, 64, 67, 71, 74], 0, 4)),
    tempoMap: [tempo(0, 80)],
  },
  {
    name: 'chord progression',
    notes: notes([
      ...chord([60, 64, 67], 0, 2),
      ...chord([57, 60, 64], 2, 2),
      ...chord([53, 57, 60], 4, 2),
      ...chord([55, 59, 62], 6, 2),
    ]),
    tempoMap: [tempo(0, 120)],
  },
  {
    name: 'one tempo change',
    notes: notes(run(C_MAJOR)),
    tempoMap: [tempo(0, 120), tempo(4, 60)],
  },
  {
    name: 'many tempo changes',
    notes: notes(run([...C_MAJOR, ...C_MAJOR])),
    tempoMap: [tempo(0, 60), tempo(2, 90), tempo(4, 150), tempo(7, 45), tempo(11, 200)],
  },
  {
    name: 'tempo map stored out of order',
    notes: notes(run(C_MAJOR)),
    tempoMap: [tempo(4, 70), tempo(0, 140)],
  },
  {
    name: 'tempo change in the middle of a note',
    notes: notes([
      [60, 0, 4],
      [62, 4, 1],
    ]),
    tempoMap: [tempo(0, 120), tempo(2, 60)],
  },
  {
    name: 'tempo change exactly on a note',
    notes: notes(run([60, 62, 64, 65], 1)),
    tempoMap: [tempo(0, 120), tempo(2, 80)],
  },
  { name: '3/4 waltz', notes: notes(run(C_MAJOR.slice(0, 6))), tempoMap: [tempo(0, 120, 3)] },
  {
    name: '6/8 compound meter',
    notes: notes(run(C_MAJOR, 0.5)),
    tempoMap: [tempo(0, 80, 6, 8)],
  },
  { name: '7/8 odd meter', notes: notes(run(C_MAJOR, 0.5)), tempoMap: [tempo(0, 100, 7, 8)] },
  { name: '5/4 meter', notes: notes(run([...C_MAJOR, 74, 76])), tempoMap: [tempo(0, 110, 5)] },
  {
    name: 'meter change 4/4 to 3/4',
    notes: notes(run([...C_MAJOR, ...C_MAJOR])),
    tempoMap: [tempo(0, 120), tempo(8, 120, 3)],
  },
  { name: 'very fast (300 bpm)', notes: notes(run(C_MAJOR, 0.25)), tempoMap: [tempo(0, 300)] },
  { name: 'very slow (20 bpm)', notes: notes(run([60, 64, 67])), tempoMap: [tempo(0, 20)] },
  {
    name: 'zero-length notes',
    notes: notes([
      [60, 0, 0],
      [62, 1, 0],
      [64, 2, 1],
    ]),
    tempoMap: [tempo(0, 120)],
  },
  {
    name: 'sixty-fourth notes',
    notes: notes(run([...C_MAJOR, ...C_MAJOR], 1 / 16)),
    tempoMap: [tempo(0, 120)],
  },
  {
    name: 'one very long note',
    notes: notes([[48, 0, 64]]),
    tempoMap: [tempo(0, 60)],
  },
  {
    name: 'offbeat entries',
    notes: notes(run(C_MAJOR, 1, 0.5)),
    tempoMap: [tempo(0, 120)],
  },
  {
    name: 'long rest before the first note',
    notes: notes(run([60, 62, 64], 1, 16)),
    tempoMap: [tempo(0, 120)],
  },
  {
    name: 'long rest in the middle',
    notes: notes([
      [60, 0, 1],
      [67, 32, 1],
    ]),
    tempoMap: [tempo(0, 120)],
  },
  { name: 'lowest piano note (A0)', notes: notes(run([21, 22, 23])), tempoMap: [tempo(0, 90)] },
  { name: 'highest piano note (C8)', notes: notes(run([106, 107, 108])), tempoMap: [tempo(0, 90)] },
  { name: 'MIDI extremes 0 and 127', notes: notes(run([0, 127, 0])), tempoMap: [tempo(0, 90)] },
  {
    name: 'notes stored out of order',
    notes: notes([
      [67, 3, 1],
      [60, 0, 1],
      [65, 2, 1],
      [62, 1, 1],
    ]),
    tempoMap: [tempo(0, 120)],
  },
  {
    name: 'overlapping notes of the same pitch',
    notes: notes([
      [60, 0, 2],
      [60, 1, 2],
      [60, 1.5, 2],
    ]),
    tempoMap: [tempo(0, 120)],
  },
  {
    name: 'legato overlaps',
    notes: notes(C_MAJOR.map((pitch, i) => [pitch, i, 1.5])),
    tempoMap: [tempo(0, 120)],
  },
  {
    name: 'velocity extremes',
    notes: notes([
      [60, 0, 1, 1],
      [62, 1, 1, 127],
      [64, 2, 1, 0],
      [65, 3, 1, 200],
    ]),
    tempoMap: [tempo(0, 120)],
  },
  { name: 'triplets', notes: notes(run(C_MAJOR.slice(0, 6), 1 / 3)), tempoMap: [tempo(0, 90)] },
  { name: 'repeated note', notes: notes(run(Array(16).fill(64), 0.5)), tempoMap: [tempo(0, 140)] },
  {
    name: 'wide leaps',
    notes: notes(run([24, 96, 36, 108, 30, 90])),
    tempoMap: [tempo(0, 100)],
  },
  {
    name: 'chromatic run',
    notes: notes(
      run(
        Array.from({ length: 25 }, (_, i) => 48 + i),
        0.25,
      ),
    ),
    tempoMap: [tempo(0, 120)],
  },
  {
    name: 'non-contiguous note indices',
    notes: run(C_MAJOR).map(([midiPitch, startBeat, durationBeats], i) => ({
      index: i * 7 + 3,
      midiPitch,
      startBeat,
      durationBeats,
      velocity: 90,
    })),
    tempoMap: [tempo(0, 120)],
  },
  {
    name: 'fractional bpm',
    notes: notes(run(C_MAJOR)),
    tempoMap: [tempo(0, 97.5)],
  },
  {
    name: 'arpeggio over a held bass',
    notes: notes([[36, 0, 8], ...run([60, 64, 67, 72, 67, 64, 60, 64], 1)]),
    tempoMap: [tempo(0, 120)],
  },
  {
    name: 'two voices in counterpoint',
    notes: notes([...run([72, 71, 69, 67], 1), ...run([48, 50, 52, 53], 1)]),
    tempoMap: [tempo(0, 96)],
  },
  {
    name: 'vocal arpeggios',
    notes: notes(run([60, 64, 67, 72, 67, 64, 60, 62, 65, 69, 74, 69, 65, 62], 0.5)),
    tempoMap: [tempo(0, 100)],
  },
  {
    name: 'accelerando by tempo steps',
    notes: notes(
      run(
        Array(16)
          .fill(60)
          .map((p, i) => p + (i % 8)),
      ),
    ),
    tempoMap: [60, 70, 80, 90, 100, 110, 120, 130].map((bpm, i) => tempo(i * 2, bpm)),
  },
  {
    name: 'ritardando by tempo steps',
    notes: notes(
      run(
        Array(16)
          .fill(72)
          .map((p, i) => p - (i % 8)),
      ),
    ),
    tempoMap: [160, 140, 120, 100, 80, 60, 50, 40].map((bpm, i) => tempo(i * 2, bpm)),
  },
  {
    name: 'a thousand notes',
    notes: notes(
      Array.from({ length: 1000 }, (_, i): [number, number, number] => [
        48 + ((i * 7) % 36),
        i * 0.25,
        0.25,
      ]),
    ),
    tempoMap: [tempo(0, 160)],
  },
  randomScenario(1, 40),
  randomScenario(2, 80),
  randomScenario(3, 120),
  randomScenario(4, 25),
  randomScenario(5, 60),
  randomScenario(6, 200),
  randomScenario(7, 15),
  randomScenario(8, 90),
]
