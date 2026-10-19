/**
 * Reads a Standard MIDI File (.mid) into a chart, and writes a chart back out as one.
 *
 * A scenario part is a single line, while a MIDI file often holds a whole arrangement, one
 * track per instrument. Merging those tracks would hand the player every instrument at once,
 * so import is two steps: readMidiFile lists the tracks that have notes, and midiTrackImport
 * builds the chart from the one the author picks. The file's tempo and time-signature changes
 * become the chart's tempo map, in the same quarter-note beats as the rest of the app.
 */
import { Midi } from '@tonejs/midi'

import { tempoMapFromMidi } from '@/audio/midi'
import { EDITOR_LIMITS, clampVelocity, isNoteInRange, normalizeNotes } from '@/lib/chart/edits'
import type { ChartLimits } from '@/lib/chart/edits'
import { pitchName } from '@/lib/chart/notes'
import { guessInstrument } from '@/lib/import/musicxml'
import type { ExpectedNote, Instrument, NoteChart } from '@/lib/schema/types'

/** What the editor's file picker offers alongside MusicXML. */
export const MIDI_ACCEPT = '.mid,.midi'

/** A MIDI file this size would be hours of music; refusing it keeps the tab responsive. */
const MAX_FILE_BYTES = 5 * 1024 * 1024

const PART_ID = 'lead'
const PERCUSSION_CHANNEL = 9

/** Thrown for input that cannot be turned into a chart at all. */
export class MidiImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MidiImportError'
  }
}

export interface MidiTrackSummary {
  /** Position in the file's track list, which midiTrackImport takes. */
  trackIndex: number
  name: string
  noteCount: number
  percussion: boolean
}

export interface MidiFile {
  midi: Midi
  /** Tracks with at least one note, in file order. */
  tracks: MidiTrackSummary[]
}

export interface MidiImport {
  title: string | null
  partName: string
  instrument: Instrument | null
  chart: NoteChart
  warnings: string[]
}

/** Every Standard MIDI File opens with the "MThd" header chunk. */
function isMidi(bytes: Uint8Array) {
  return bytes[0] === 0x4d && bytes[1] === 0x54 && bytes[2] === 0x68 && bytes[3] === 0x64
}

export async function readMidiUpload(file: File): Promise<MidiFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new MidiImportError('That file is too large to be a MIDI score.')
  }
  return readMidiFile(new Uint8Array(await file.arrayBuffer()))
}

export function readMidiFile(bytes: Uint8Array): MidiFile {
  if (!isMidi(bytes)) throw new MidiImportError('This file is not a MIDI file.')

  let midi: Midi
  try {
    midi = new Midi(bytes)
  } catch {
    throw new MidiImportError('This MIDI file is damaged and could not be read.')
  }

  const tracks = midi.tracks
    .map((track, trackIndex) => ({
      trackIndex,
      name: track.name.trim() || track.instrument.name || `Track ${trackIndex + 1}`,
      noteCount: track.notes.length,
      percussion: track.channel === PERCUSSION_CHANNEL || track.instrument.percussion,
    }))
    .filter((track) => track.noteCount > 0)
  if (tracks.length === 0) throw new MidiImportError('This MIDI file has no notes.')

  return { midi, tracks }
}

export function midiTrackImport(
  file: MidiFile,
  trackIndex: number,
  limits: ChartLimits = EDITOR_LIMITS,
): MidiImport {
  const { midi } = file
  const track = midi.tracks[trackIndex]
  const summary = file.tracks.find((entry) => entry.trackIndex === trackIndex)
  if (!track || !summary) throw new MidiImportError('That track has no notes to import.')

  const ppq = midi.header.ppq
  const warnings: string[] = []
  if (summary.percussion) {
    warnings.push(`${summary.name} is a drum track, so its notes stand for drums, not pitches.`)
  }

  const notes: ExpectedNote[] = track.notes.map((note, index) => ({
    index,
    midiPitch: note.midi,
    startBeat: note.ticks / ppq,
    durationBeats: note.durationTicks / ppq,
    velocity: clampVelocity(note.velocity * 127),
  }))
  const inRange = notes.filter((note) => isNoteInRange(note, limits))
  const dropped = notes.length - inRange.length
  if (dropped > 0) {
    warnings.push(
      `${dropped} ${dropped === 1 ? 'note' : 'notes'} outside the editor's range ` +
        `(${pitchName(limits.minPitch)} to ${pitchName(limits.maxPitch)}, ` +
        `${limits.maxBeat} beats) ${dropped === 1 ? 'was' : 'were'} dropped.`,
    )
  }
  if (inRange.length === 0) {
    throw new MidiImportError(
      [`No playable notes found in ${summary.name}.`, ...warnings].join(' '),
    )
  }

  return {
    title: midi.header.name.trim() || null,
    partName: summary.name,
    instrument: summary.percussion
      ? null
      : guessInstrument(`${summary.name} ${track.instrument.family} ${track.instrument.name}`),
    chart: {
      keySignature: keySignatureOf(midi),
      tempoMap: tempoMapFromMidi(midi),
      parts: [
        {
          partId: PART_ID,
          name: summary.name,
          instrument: 'piano',
          notes: normalizeNotes(inRange),
        },
      ],
    },
    warnings,
  }
}

/** Major key names by fifths, -7 (Cb) to 7 (C#), the order MIDI key-signature events use. */
const KEYS_BY_FIFTHS = [
  'Cb',
  'Gb',
  'Db',
  'Ab',
  'Eb',
  'Bb',
  'F',
  'C',
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#',
]

function keySignatureOf(midi: Midi) {
  const key = midi.header.keySignatures.find((entry) => entry.ticks === 0)?.key
  const at = key ? KEYS_BY_FIFTHS.indexOf(key) : -1
  return at === -1 ? 0 : at - 7
}

/**
 * Writes a chart as a .mid file other software can open: one track per part, plus the tempo
 * map's tempo and meter changes. Ticks use the library's default resolution of 480 per beat.
 */
export function chartToMidi(chart: NoteChart, title = ''): Uint8Array {
  const midi = new Midi()
  const ppq = midi.header.ppq
  const toTicks = (beats: number) => Math.round(beats * ppq)

  midi.header.name = title
  for (const entry of [...chart.tempoMap].sort((a, b) => a.atBeat - b.atBeat)) {
    const ticks = toTicks(entry.atBeat)
    midi.header.tempos.push({ ticks, bpm: entry.bpm })
    midi.header.timeSignatures.push({ ticks, timeSignature: [entry.timeSigNum, entry.timeSigDen] })
  }
  const key = KEYS_BY_FIFTHS[chart.keySignature + 7]
  if (key) midi.header.keySignatures.push({ ticks: 0, key, scale: 'major' })
  midi.header.update()

  for (const part of chart.parts) {
    const track = midi.addTrack()
    track.name = part.name
    for (const note of part.notes) {
      track.addNote({
        midi: note.midiPitch,
        ticks: toTicks(note.startBeat),
        durationTicks: Math.max(1, toTicks(note.durationBeats)),
        velocity: note.velocity / 127,
      })
    }
  }
  const bytes = midi.toArray()
  if (key) writeKeySignature(bytes, chart.keySignature)
  return bytes
}

/**
 * @tonejs/midi encodes a key signature's sharps/flats byte as its key-name index + 7 instead
 * of - 7, so every key but Cb comes out wrong. The event is FF 59 02 <sf> <mi>; this rewrites
 * <sf> in place, as the signed byte the format specifies.
 */
function writeKeySignature(bytes: Uint8Array, fifths: number) {
  for (let i = 0; i + 4 < bytes.length; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0x59 && bytes[i + 2] === 0x02) {
      bytes[i + 3] = fifths & 0xff
      return
    }
  }
}
