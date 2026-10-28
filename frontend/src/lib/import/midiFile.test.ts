/** User story #30: a .mid file pre-populates a scenario, and a scenario exports as one. */
import { Midi } from '@tonejs/midi'
import { describe, expect, it } from 'vitest'

import { addNotes } from '@/lib/chart/edits'
import { MidiImportError, chartToMidi, midiTrackImport, readMidiFile } from '@/lib/import/midiFile'
import { emptyChart } from '@/lib/schema/collections'
import type { NoteChart } from '@/lib/schema/types'

function singleTrack() {
  const midi = new Midi()
  midi.header.name = 'Ode'
  midi.header.tempos.push({ ticks: 0, bpm: 90 })
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] })
  midi.header.update()
  const track = midi.addTrack()
  track.name = 'Piano'
  const ppq = midi.header.ppq
  track.addNote({ midi: 64, ticks: 0, durationTicks: ppq, velocity: 100 / 127 })
  track.addNote({ midi: 62, ticks: ppq, durationTicks: ppq / 2, velocity: 50 / 127 })
  return midi.toArray()
}

describe('readMidiFile', () => {
  it('imports a single-track file with its notes, tempo and time signature', () => {
    const file = readMidiFile(singleTrack())
    expect(file.tracks).toHaveLength(1)

    const imported = midiTrackImport(file, file.tracks[0].trackIndex)
    expect(imported.title).toBe('Ode')
    expect(imported.instrument).toBe('piano')
    expect(imported.chart.tempoMap).toEqual([{ atBeat: 0, bpm: 90, timeSigNum: 3, timeSigDen: 4 }])
    expect(imported.chart.parts[0].notes).toEqual([
      { index: 0, midiPitch: 64, startBeat: 0, durationBeats: 1, velocity: 100 },
      { index: 1, midiPitch: 62, startBeat: 1, durationBeats: 0.5, velocity: 50 },
    ])
  })

  it('lists each track of a multi-track file instead of merging them', () => {
    const midi = new Midi()
    const tracks: [string, number][] = [
      ['Melody', 72],
      ['Bass', 40],
    ]
    for (const [name, pitch] of tracks) {
      const track = midi.addTrack()
      track.name = name
      track.addNote({ midi: pitch, ticks: 0, durationTicks: 480 })
    }
    const file = readMidiFile(midi.toArray())

    expect(file.tracks.map((track) => track.name)).toEqual(['Melody', 'Bass'])
    const bass = midiTrackImport(file, file.tracks[1].trackIndex)
    expect(bass.chart.parts[0].notes.map((note) => note.midiPitch)).toEqual([40])
  })

  it('rejects a file that is not MIDI', () => {
    const text = new TextEncoder().encode('<score-partwise/>')
    expect(() => readMidiFile(text)).toThrow(MidiImportError)
    expect(() => readMidiFile(text)).toThrow('not a MIDI file')
  })

  it('rejects a damaged MIDI file', () => {
    expect(() => readMidiFile(singleTrack().slice(0, 30))).toThrow(MidiImportError)
  })

  it('rejects a file with no notes', () => {
    expect(() => readMidiFile(new Midi().toArray())).toThrow('no notes')
  })

  it('drops notes outside the editor range with a warning', () => {
    const midi = new Midi()
    const track = midi.addTrack()
    track.addNote({ midi: 60, ticks: 0, durationTicks: 480 })
    track.addNote({ midi: 10, ticks: 480, durationTicks: 480 })
    const imported = midiTrackImport(readMidiFile(midi.toArray()), 0)

    expect(imported.chart.parts[0].notes).toHaveLength(1)
    expect(imported.warnings[0]).toMatch(/1 note outside/)
  })
})

describe('chartToMidi', () => {
  it('round-trips a chart through export and import', () => {
    const chart: NoteChart = addNotes(
      {
        ...emptyChart('piano'),
        keySignature: 2,
        tempoMap: [
          { atBeat: 0, bpm: 100, timeSigNum: 4, timeSigDen: 4 },
          { atBeat: 8, bpm: 140, timeSigNum: 6, timeSigDen: 8 },
        ],
      },
      'lead',
      [
        { midiPitch: 60, startBeat: 0, durationBeats: 1, velocity: 30 },
        { midiPitch: 64, startBeat: 0, durationBeats: 2, velocity: 90 },
        { midiPitch: 67, startBeat: 2.5, durationBeats: 0.25, velocity: 127 },
        { midiPitch: 72, startBeat: 9, durationBeats: 1.5, velocity: 64 },
      ],
    )

    const imported = midiTrackImport(readMidiFile(chartToMidi(chart, 'Round Trip')), 0)

    expect(imported.title).toBe('Round Trip')
    expect(imported.chart.keySignature).toBe(2)
    expect(imported.chart.tempoMap).toEqual(chart.tempoMap)
    expect(imported.chart.parts[0].notes).toEqual(chart.parts[0].notes)
  })
})
