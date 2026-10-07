/**
 * MusicXML to NoteChart conversion for the scenario editor's file import.
 *
 * MusicXML writes no onsets: a part is a list of measures, and each note only
 * says how long it lasts, so position comes from walking a cursor that notes
 * advance and <backup>/<forward> move. Durations are in `divisions` per quarter
 * note, which maps straight onto the chart's quarter-note beats (see
 * lib/chart/notes) without going through the tempo.
 *
 * What comes out is what a player performs rather than what is printed: repeats
 * and voltas are unrolled, tied notes are merged into one, and transposing
 * instruments are moved to sounding pitch. Only the first part is read, and on
 * each of its staves only the first voice -- multi-part and multi-voice charts
 * are backlog. Anything left out is reported in `warnings` instead of failing
 * the import. Nothing here touches Firestore or React.
 */
import { DEFAULT_VELOCITY, EDITOR_LIMITS, isNoteInRange, normalizeNotes } from '@/lib/chart/edits'
import type { ChartLimits } from '@/lib/chart/edits'
import { beatsPerBar, pitchName } from '@/lib/chart/notes'
import type { ExpectedNote, Instrument, NoteChart, TempoMapEntry } from '@/lib/schema/types'

export interface MusicXmlImport {
  /** The score's title, when it names one. */
  title: string | null
  /** The imported part's name as the score gives it. */
  partName: string
  /** A guess from the part's name and sound; null when nothing matched. */
  instrument: Instrument | null
  /** One part holding every imported note. Its instrument is a placeholder. */
  chart: NoteChart
  /** Human-readable notes on what was skipped or simplified. */
  warnings: string[]
}

/** Thrown for input that cannot be turned into a chart at all. */
export class MusicXmlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MusicXmlError'
  }
}

/** Matches emptyChart(), so imported and hand-built charts share a part id. */
const PART_ID = 'lead'

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

const BEAT_UNIT_BEATS: Record<string, number> = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  '16th': 0.25,
}

/** MusicXML defines <sound dynamics> as a percentage of this MIDI velocity. */
const FORTE_VELOCITY = 90

/** Guards against a malformed score whose repeats would never run out. */
const MAX_UNROLLED_MEASURES = 20_000

const INSTRUMENT_HINTS: [RegExp, Instrument][] = [
  [/piano|keyboard|organ|harpsichord/, 'piano'],
  [/guitar|pluck|bass|ukulele|banjo|mandolin/, 'guitar'],
  [/flute|clarinet|oboe|bassoon|sax|piccolo|recorder|wind/, 'woodwind'],
  [/voice|vocal|soprano|alto|tenor|baritone|choir/, 'vocals'],
]

export function parseMusicXml(xml: string, limits: ChartLimits = EDITOR_LIMITS): MusicXmlImport {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const root = doc.documentElement
  if (doc.querySelector('parsererror')) {
    throw new MusicXmlError('This file is not valid XML.')
  }
  if (root.tagName === 'score-timewise') {
    throw new MusicXmlError('Timewise MusicXML is not supported -- export the score as partwise.')
  }
  if (root.tagName !== 'score-partwise') {
    throw new MusicXmlError('This file is not a MusicXML score.')
  }

  const parts = children(root, 'part')
  if (parts.length === 0) throw new MusicXmlError('This score has no parts.')

  const scoreParts = children(child(root, 'part-list'), 'score-part')
  const nameOf = (part: Element, at: number) => {
    const scorePart = scoreParts.find((entry) => entry.getAttribute('id') === part.id)
    return text(child(scorePart, 'part-name')) || `Part ${at + 1}`
  }

  const part = parts[0]
  const partName = nameOf(part, 0)
  const scorePart = scoreParts.find((entry) => entry.getAttribute('id') === part.id)
  const warnings: string[] = []

  if (parts.length > 1) {
    const skipped = parts.slice(1).map((entry, at) => nameOf(entry, at + 1))
    warnings.push(`Only the first part (${partName}) was imported; skipped ${skipped.join(', ')}.`)
  }

  const walked = walkPart(part, warnings)
  const inRange = walked.notes.filter((note) => isNoteInRange(note, limits))
  const dropped = walked.notes.length - inRange.length
  if (dropped > 0) {
    warnings.push(
      `${count(dropped, 'note')} outside the editor's range ` +
        `(${pitchName(limits.minPitch)} to ${pitchName(limits.maxPitch)}, ` +
        `${limits.maxBeat} beats) ${dropped === 1 ? 'was' : 'were'} dropped.`,
    )
  }
  if (inRange.length === 0) {
    throw new MusicXmlError([`No playable notes found in ${partName}.`, ...warnings].join(' '))
  }

  return {
    title: scoreTitle(root),
    partName,
    instrument: guessInstrument(
      `${partName} ${text(scorePart?.querySelector('instrument-sound'))}`,
    ),
    chart: {
      keySignature: walked.keySignature,
      tempoMap: walked.tempoMap,
      parts: [
        { partId: PART_ID, name: partName, instrument: 'piano', notes: normalizeNotes(inRange) },
      ],
    },
    warnings,
  }
}

interface WalkResult {
  notes: ExpectedNote[]
  tempoMap: TempoMapEntry[]
  keySignature: number
}

function walkPart(part: Element, warnings: string[]): WalkResult {
  const measures = children(part, 'measure')
  const firstVoices = firstVoicePerStaff(part)

  const notes: ExpectedNote[] = []
  const tempoMap: TempoMapEntry[] = [{ atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 }]
  // Notes still being held by a tie, keyed by staff and pitch.
  const tied = new Map<string, ExpectedNote>()

  let divisions = 1
  let transpose = 0
  let velocity = DEFAULT_VELOCITY
  let keySignature: number | null = null
  let measureStart = 0
  let secondaryVoiceNotes = 0
  let unpitchedNotes = 0
  let graceNotes = 0

  function setTempo(atBeat: number, patch: Partial<TempoMapEntry>) {
    const current = tempoMap[tempoMap.length - 1]
    const next = { ...current, ...patch, atBeat }
    if (
      next.bpm === current.bpm &&
      next.timeSigNum === current.timeSigNum &&
      next.timeSigDen === current.timeSigDen
    ) {
      return
    }
    if (current.atBeat === atBeat) tempoMap[tempoMap.length - 1] = next
    else tempoMap.push(next)
  }

  function readSound(sound: Element | undefined, atBeat: number) {
    if (!sound) return
    const bpm = Number(sound.getAttribute('tempo'))
    if (sound.hasAttribute('tempo') && bpm > 0) setTempo(atBeat, { bpm: tidy(bpm) })
    const dynamics = Number(sound.getAttribute('dynamics'))
    if (sound.hasAttribute('dynamics') && dynamics > 0) {
      velocity = Math.min(127, Math.max(1, Math.round((dynamics / 100) * FORTE_VELOCITY)))
    }
  }

  for (const measureIndex of unrollRepeats(measures, warnings)) {
    // Position within the measure, in beats.
    let cursor = 0
    let reached = 0
    let lastOnset = 0

    for (const element of measures[measureIndex].children) {
      const atBeat = tidy(measureStart + cursor)

      switch (element.tagName) {
        case 'attributes': {
          divisions = number(child(element, 'divisions')) || divisions
          const fifths = child(child(element, 'key'), 'fifths')
          if (fifths && keySignature === null) keySignature = number(fifths)
          const time = child(element, 'time')
          const beats = sum(text(child(time, 'beats')))
          const beatType = number(child(time, 'beat-type'))
          if (beats > 0 && beatType > 0) {
            setTempo(atBeat, { timeSigNum: beats, timeSigDen: beatType })
          }
          const shift = child(element, 'transpose')
          if (shift) {
            transpose =
              number(child(shift, 'chromatic')) + 12 * number(child(shift, 'octave-change'))
          }
          break
        }
        case 'direction': {
          const sound = child(element, 'sound')
          readSound(sound, atBeat)
          if (!sound?.hasAttribute('tempo')) {
            const bpm = metronomeBpm(element.querySelector('metronome'))
            if (bpm) setTempo(atBeat, { bpm })
          }
          break
        }
        case 'sound':
          readSound(element, atBeat)
          break
        case 'backup':
          cursor -= number(child(element, 'duration')) / divisions
          break
        case 'forward':
          cursor += number(child(element, 'duration')) / divisions
          reached = Math.max(reached, cursor)
          break
        case 'note': {
          // Grace notes take no time of their own, so they never move the cursor.
          if (child(element, 'grace')) {
            graceNotes++
            break
          }
          const duration = number(child(element, 'duration')) / divisions
          const inChord = Boolean(child(element, 'chord'))
          const onset = inChord ? lastOnset : cursor
          if (!inChord) {
            lastOnset = cursor
            cursor += duration
            reached = Math.max(reached, cursor)
          }

          if (child(element, 'rest') || child(element, 'cue')) break
          const pitch = child(element, 'pitch')
          if (!pitch) {
            unpitchedNotes++
            break
          }
          const staff = text(child(element, 'staff')) || '1'
          if ((text(child(element, 'voice')) || '1') !== firstVoices.get(staff)) {
            secondaryVoiceNotes++
            break
          }

          const midiPitch =
            12 * (number(child(pitch, 'octave')) + 1) +
            (STEP_SEMITONES[text(child(pitch, 'step'))] ?? 0) +
            Math.round(number(child(pitch, 'alter'))) +
            transpose
          const startBeat = tidy(measureStart + onset)
          const endBeat = tidy(measureStart + onset + duration)
          const ties = tieTypes(element)
          const key = `${staff}:${midiPitch}`

          const held = tied.get(key)
          if (ties.stop && held && sameBeat(held.startBeat + held.durationBeats, startBeat)) {
            held.durationBeats = tidy(endBeat - held.startBeat)
            if (!ties.start) tied.delete(key)
            break
          }

          const note: ExpectedNote = {
            index: notes.length,
            midiPitch,
            startBeat,
            durationBeats: tidy(endBeat - startBeat),
            velocity,
          }
          notes.push(note)
          if (ties.start) tied.set(key, note)
          else tied.delete(key)
          break
        }
      }
    }

    // A pickup bar is shorter than its meter says, so trust what was written.
    measureStart = tidy(
      measureStart + (reached > 0 ? reached : beatsPerBar(tempoMap[tempoMap.length - 1])),
    )
  }

  if (secondaryVoiceNotes > 0) {
    warnings.push(
      `${count(secondaryVoiceNotes, 'note')} in secondary voices ` +
        `${secondaryVoiceNotes === 1 ? 'was' : 'were'} skipped; ` +
        'only the first voice on each staff is imported.',
    )
  }
  if (unpitchedNotes > 0) {
    warnings.push(
      `${count(unpitchedNotes, 'unpitched percussion note')} ` +
        `${unpitchedNotes === 1 ? 'was' : 'were'} skipped.`,
    )
  }
  if (graceNotes > 0) {
    warnings.push(
      `${count(graceNotes, 'grace note')} ${graceNotes === 1 ? 'was' : 'were'} skipped.`,
    )
  }

  return { notes, tempoMap, keySignature: keySignature ?? 0 }
}

/**
 * The order measures are performed in, as indexes into `measures`.
 *
 * Follows repeat barlines (honouring `times`) and numbered endings. D.C., D.S.
 * and coda jumps are not followed; a score using them imports straight through
 * with a warning.
 */
function unrollRepeats(measures: Element[], warnings: string[]): number[] {
  const marks = measures.map((measure) => {
    const barlines = children(measure, 'barline')
    const repeats = barlines.flatMap((barline) => children(barline, 'repeat'))
    const backward = repeats.find((repeat) => repeat.getAttribute('direction') === 'backward')
    return {
      forward: repeats.some((repeat) => repeat.getAttribute('direction') === 'forward'),
      // How many times the barline sends the player back.
      jumps: backward ? Math.max(1, (Number(backward.getAttribute('times')) || 2) - 1) : 0,
      endingStart: barlines
        .flatMap((barline) => children(barline, 'ending'))
        .find((ending) => ending.getAttribute('type') === 'start'),
      endingStop: barlines
        .flatMap((barline) => children(barline, 'ending'))
        .some((ending) => ending.getAttribute('type') !== 'start'),
    }
  })

  // An ending can span several measures, so carry its numbers from start to stop.
  let open = null as number[] | null
  const endings = marks.map((mark) => {
    if (mark.endingStart) {
      open = (mark.endingStart.getAttribute('number') ?? '')
        .split(/[\s,]+/)
        .map(Number)
        .filter((value) => value > 0)
    }
    const numbers = open
    if (mark.endingStop) open = null
    return numbers
  })

  const jumpAttributes = ['dacapo', 'dalsegno', 'tocoda', 'fine']
  if (
    measures.some((measure) =>
      [...measure.querySelectorAll('sound')].some((sound) =>
        jumpAttributes.some((attribute) => sound.hasAttribute(attribute)),
      ),
    )
  ) {
    warnings.push('D.C., D.S. and coda jumps are not followed; the score was imported in order.')
  }

  const order: number[] = []
  const taken = new Array<number>(measures.length).fill(0)
  let sectionStart = 0
  let pass = 1

  for (let at = 0; at < measures.length && order.length < MAX_UNROLLED_MEASURES;) {
    const mark = marks[at]
    if (mark.forward && at !== sectionStart) {
      sectionStart = at
      pass = 1
    }

    const numbers = endings[at]
    if (numbers && numbers.length > 0 && !numbers.includes(pass)) {
      at++
      continue
    }

    order.push(at)

    if (mark.jumps > 0 && taken[at] < mark.jumps) {
      taken[at]++
      pass++
      at = sectionStart
      continue
    }
    // Past the last barline or the final ending, the next repeat starts fresh.
    if (mark.jumps > 0 || (numbers && mark.endingStop)) {
      sectionStart = at + 1
      pass = 1
    }
    at++
  }

  return order
}

/** The lowest-numbered voice on each staff, which is the one that gets imported. */
function firstVoicePerStaff(part: Element): Map<string, string> {
  const first = new Map<string, string>()
  for (const note of part.querySelectorAll('note')) {
    const staff = text(child(note, 'staff')) || '1'
    const voice = text(child(note, 'voice')) || '1'
    const current = first.get(staff)
    if (current === undefined || Number(voice) < Number(current)) first.set(staff, voice)
  }
  return first
}

/** Whether a note begins a tie, ends one, or both. */
function tieTypes(note: Element) {
  // <tie> is the playback element; older exports only write the printed <tied>.
  let ties = children(note, 'tie')
  if (ties.length === 0) ties = [...note.querySelectorAll('notations > tied')]
  const types = ties.map((tie) => tie.getAttribute('type'))
  return {
    start: types.includes('start') || types.includes('continue'),
    stop: types.includes('stop') || types.includes('continue'),
  }
}

/** Quarter notes per minute from a printed "note = N" marking, if it has one. */
function metronomeBpm(metronome: Element | null) {
  if (!metronome) return null
  const unit = BEAT_UNIT_BEATS[text(child(metronome, 'beat-unit'))]
  const perMinute = Number.parseFloat(text(child(metronome, 'per-minute')).replace(/^[^\d]+/, ''))
  if (!unit || !(perMinute > 0)) return null
  const dots = children(metronome, 'beat-unit-dot').length
  return tidy(perMinute * unit * (2 - 0.5 ** dots))
}

function scoreTitle(root: Element) {
  return (
    text(root.querySelector('work > work-title')) ||
    text(child(root, 'movement-title')) ||
    text(
      [...root.querySelectorAll('credit')]
        .find((credit) => text(child(credit, 'credit-type')) === 'title')
        ?.querySelector('credit-words'),
    ) ||
    null
  )
}

function guessInstrument(description: string): Instrument | null {
  const lower = description.toLowerCase()
  return INSTRUMENT_HINTS.find(([pattern]) => pattern.test(lower))?.[1] ?? null
}

/* ------------------------------------------------------------ DOM helpers */

function children(parent: Element | null | undefined, tagName: string) {
  return parent ? [...parent.children].filter((element) => element.tagName === tagName) : []
}

function child(parent: Element | null | undefined, tagName: string): Element | undefined {
  return children(parent, tagName)[0]
}

function text(element: Element | null | undefined) {
  return element?.textContent?.trim() ?? ''
}

function number(element: Element | null | undefined) {
  const value = Number(text(element))
  return Number.isFinite(value) ? value : 0
}

/** Adds up a composite numerator such as "3+2". */
function sum(expression: string) {
  return expression.split('+').reduce((total, term) => total + (Number(term) || 0), 0)
}

/** Clears the float residue that thirds of a beat leave behind. */
function tidy(value: number) {
  return Math.round(value * 1e6) / 1e6
}

function sameBeat(a: number, b: number) {
  return Math.abs(a - b) < 1e-4
}

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}
