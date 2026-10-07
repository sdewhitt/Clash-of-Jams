/**
 * User story #29: turning an uploaded MusicXML score into a note chart.
 *
 * The scores here are written by hand and kept as small as each case allows,
 * so a failure points at one MusicXML feature rather than at a whole export.
 */
import { describe, expect, it } from 'vitest'

import { MusicXmlError, parseMusicXml } from '@/lib/import/musicxml'

interface NoteSpec {
  /** Step and octave, e.g. "C4"; omit for a rest. */
  pitch?: string
  duration: number
  voice?: number
  staff?: number
  alter?: number
  chord?: boolean
  tie?: 'start' | 'stop' | 'both'
  grace?: boolean
}

function note(spec: NoteSpec) {
  const ties = spec.tie === 'both' ? ['stop', 'start'] : spec.tie ? [spec.tie] : []
  return [
    '<note>',
    spec.grace ? '<grace/>' : '',
    spec.chord ? '<chord/>' : '',
    spec.pitch
      ? `<pitch><step>${spec.pitch[0]}</step>` +
        (spec.alter ? `<alter>${spec.alter}</alter>` : '') +
        `<octave>${spec.pitch.slice(1)}</octave></pitch>`
      : '<rest/>',
    spec.grace ? '' : `<duration>${spec.duration}</duration>`,
    ...ties.map((type) => `<tie type="${type}"/>`),
    `<voice>${spec.voice ?? 1}</voice>`,
    spec.staff ? `<staff>${spec.staff}</staff>` : '',
    '</note>',
  ].join('')
}

/** One quarter note per division, so a duration of 1 is one beat. */
const ATTRIBUTES =
  '<attributes><divisions>1</divisions><key><fifths>0</fifths></key>' +
  '<time><beats>4</beats><beat-type>4</beat-type></time></attributes>'

const backup = (duration: number) => `<backup><duration>${duration}</duration></backup>`
const tempo = (bpm: number) => `<direction><sound tempo="${bpm}"/></direction>`
const repeat = (direction: 'forward' | 'backward', location: 'left' | 'right') =>
  `<barline location="${location}"><repeat direction="${direction}"/></barline>`
const ending = (number: string, type: 'start' | 'stop', location: 'left' | 'right') =>
  `<barline location="${location}"><ending number="${number}" type="${type}"/></barline>`

function score(measures: string[], extra = '') {
  return scoreOf([{ id: 'P1', name: 'Piano', measures }], extra)
}

function scoreOf(parts: { id: string; name: string; measures: string[] }[], extra = '') {
  return (
    '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0">' +
    extra +
    '<part-list>' +
    parts
      .map((part) => `<score-part id="${part.id}"><part-name>${part.name}</part-name></score-part>`)
      .join('') +
    '</part-list>' +
    parts
      .map(
        (part) =>
          `<part id="${part.id}">` +
          part.measures
            .map((content, at) => `<measure number="${at + 1}">${content}</measure>`)
            .join('') +
          '</part>',
      )
      .join('') +
    '</score-partwise>'
  )
}

/** Each note as [midiPitch, startBeat, durationBeats]. */
function notesOf(xml: string) {
  return parseMusicXml(xml).chart.parts[0].notes.map((entry) => [
    entry.midiPitch,
    entry.startBeat,
    entry.durationBeats,
  ])
}

const BAR_OF_C = note({ pitch: 'C4', duration: 4 })
const BAR_OF_D = note({ pitch: 'D4', duration: 4 })
const BAR_OF_E = note({ pitch: 'E4', duration: 4 })
const BAR_OF_F = note({ pitch: 'F4', duration: 4 })

describe('notes', () => {
  it('places notes by walking their durations and converts pitch to MIDI', () => {
    const xml = score([
      ATTRIBUTES +
        note({ pitch: 'E4', duration: 1 }) +
        note({ pitch: 'D4', duration: 1 }) +
        note({ pitch: 'C4', duration: 2 }),
      note({ pitch: 'G4', duration: 4 }),
    ])

    expect(notesOf(xml)).toEqual([
      [64, 0, 1],
      [62, 1, 1],
      [60, 2, 2],
      [67, 4, 4],
    ])
  })

  it('numbers notes by position and gives them the default velocity', () => {
    const { chart } = parseMusicXml(score([ATTRIBUTES + BAR_OF_C, BAR_OF_D]))

    expect(chart.parts[0].notes.map((entry) => entry.index)).toEqual([0, 1])
    expect(chart.parts[0].notes.every((entry) => entry.velocity === 80)).toBe(true)
  })

  it('applies accidentals and skips rests without losing their time', () => {
    const xml = score([
      ATTRIBUTES +
        note({ pitch: 'F4', alter: 1, duration: 1 }) +
        note({ duration: 2 }) +
        note({ pitch: 'B3', alter: -1, duration: 1 }),
    ])

    expect(notesOf(xml)).toEqual([
      [66, 0, 1],
      [58, 3, 1],
    ])
  })

  it('scales durations by the score divisions, including triplets', () => {
    const attributes = ATTRIBUTES.replace('<divisions>1<', '<divisions>3<')
    const xml = score([
      attributes +
        note({ pitch: 'C4', duration: 2 }) +
        note({ pitch: 'D4', duration: 2 }) +
        note({ pitch: 'E4', duration: 2 }) +
        note({ pitch: 'G4', duration: 6 }),
    ])

    const notes = notesOf(xml)
    expect(notes.map(([pitch]) => pitch)).toEqual([60, 62, 64, 67])
    expect(notes[1][1]).toBeCloseTo(2 / 3, 5)
    expect(notes[2][1]).toBeCloseTo(4 / 3, 5)
    expect(notes[3]).toEqual([67, 2, 2])
  })

  it('stacks chord notes on one onset', () => {
    const xml = score([
      ATTRIBUTES +
        note({ pitch: 'C4', duration: 2 }) +
        note({ pitch: 'E4', duration: 2, chord: true }) +
        note({ pitch: 'G4', duration: 2 }),
    ])

    expect(notesOf(xml)).toEqual([
      [60, 0, 2],
      [64, 0, 2],
      [67, 2, 2],
    ])
  })

  it('merges tied notes into one, across a barline', () => {
    const xml = score([
      ATTRIBUTES + note({ duration: 2 }) + note({ pitch: 'C4', duration: 2, tie: 'start' }),
      note({ pitch: 'C4', duration: 4, tie: 'both' }),
      note({ pitch: 'C4', duration: 1, tie: 'stop' }) + note({ pitch: 'C4', duration: 3 }),
    ])

    expect(notesOf(xml)).toEqual([
      [60, 2, 7],
      [60, 9, 3],
    ])
  })

  it('moves a transposing part to sounding pitch', () => {
    const attributes = ATTRIBUTES.replace(
      '</attributes>',
      '<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose></attributes>',
    )

    expect(notesOf(score([attributes + BAR_OF_D]))).toEqual([[60, 0, 4]])
  })

  it('skips grace notes and says so', () => {
    const xml = score([ATTRIBUTES + note({ pitch: 'D4', duration: 0, grace: true }) + BAR_OF_C])
    const result = parseMusicXml(xml)

    expect(result.chart.parts[0].notes).toHaveLength(1)
    expect(result.warnings).toEqual(['1 grace note was skipped.'])
  })

  it('drops notes outside the range the editor can show and says so', () => {
    const xml = score([
      ATTRIBUTES + note({ pitch: 'C1', duration: 2 }) + note({ pitch: 'C4', duration: 2 }),
    ])
    const result = parseMusicXml(xml)

    expect(result.chart.parts[0].notes.map((entry) => entry.midiPitch)).toEqual([60])
    expect(result.warnings[0]).toMatch(/^1 note outside the editor's range \(C2 to C6/)
  })
})

describe('staves and voices', () => {
  it('imports every staff of a part into one chart part', () => {
    const xml = score([
      ATTRIBUTES +
        note({ pitch: 'E4', duration: 4, voice: 1, staff: 1 }) +
        backup(4) +
        note({ pitch: 'C3', duration: 4, voice: 5, staff: 2 }),
    ])
    const result = parseMusicXml(xml)

    expect(result.chart.parts).toHaveLength(1)
    expect(notesOf(xml)).toEqual([
      [48, 0, 4],
      [64, 0, 4],
    ])
    expect(result.warnings).toEqual([])
  })

  it('keeps only the first voice on each staff', () => {
    const xml = score([
      ATTRIBUTES +
        note({ pitch: 'E4', duration: 4, voice: 1, staff: 1 }) +
        backup(4) +
        note({ pitch: 'G3', duration: 2, voice: 2, staff: 1 }) +
        note({ pitch: 'A3', duration: 2, voice: 2, staff: 1 }) +
        backup(4) +
        note({ pitch: 'C3', duration: 4, voice: 5, staff: 2 }),
    ])
    const result = parseMusicXml(xml)

    expect(notesOf(xml)).toEqual([
      [48, 0, 4],
      [64, 0, 4],
    ])
    expect(result.warnings).toEqual([
      '2 notes in secondary voices were skipped; only the first voice on each staff is imported.',
    ])
  })

  it('imports the first part of a multi-part score and names the rest', () => {
    const xml = scoreOf([
      { id: 'P1', name: 'Flute', measures: [ATTRIBUTES + BAR_OF_C] },
      { id: 'P2', name: 'Cello', measures: [ATTRIBUTES + BAR_OF_D] },
    ])
    const result = parseMusicXml(xml)

    expect(result.partName).toBe('Flute')
    expect(result.instrument).toBe('woodwind')
    expect(notesOf(xml)).toEqual([[60, 0, 4]])
    expect(result.warnings).toEqual(['Only the first part (Flute) was imported; skipped Cello.'])
  })
})

describe('repeats', () => {
  it('plays a repeated section twice', () => {
    const xml = score([
      ATTRIBUTES + repeat('forward', 'left') + BAR_OF_C,
      BAR_OF_D + repeat('backward', 'right'),
      BAR_OF_E,
    ])

    expect(notesOf(xml).map(([pitch, start]) => [pitch, start])).toEqual([
      [60, 0],
      [62, 4],
      [60, 8],
      [62, 12],
      [64, 16],
    ])
  })

  it('repeats from the top when there is no opening repeat barline', () => {
    const xml = score([ATTRIBUTES + BAR_OF_C + repeat('backward', 'right'), BAR_OF_D])

    expect(notesOf(xml).map(([pitch]) => pitch)).toEqual([60, 60, 62])
  })

  it('takes the first ending once and the second ending after it', () => {
    const xml = score([
      ATTRIBUTES + repeat('forward', 'left') + BAR_OF_C,
      ending('1', 'start', 'left') +
        BAR_OF_D +
        ending('1', 'stop', 'right') +
        repeat('backward', 'right'),
      ending('2', 'start', 'left') + BAR_OF_E + ending('2', 'stop', 'right'),
      BAR_OF_F,
    ])

    expect(notesOf(xml).map(([pitch]) => pitch)).toEqual([60, 62, 60, 64, 65])
  })

  it('starts a later repeat from where the previous one ended', () => {
    const xml = score([
      ATTRIBUTES + BAR_OF_C + repeat('backward', 'right'),
      BAR_OF_D,
      BAR_OF_E + repeat('backward', 'right'),
    ])

    expect(notesOf(xml).map(([pitch]) => pitch)).toEqual([60, 60, 62, 64, 62, 64])
  })

  it('warns that D.C. and coda jumps are not followed', () => {
    const xml = score([
      ATTRIBUTES + BAR_OF_C,
      BAR_OF_D + '<direction><sound dacapo="yes"/></direction>',
    ])
    const result = parseMusicXml(xml)

    expect(result.chart.parts[0].notes).toHaveLength(2)
    expect(result.warnings).toEqual([
      'D.C., D.S. and coda jumps are not followed; the score was imported in order.',
    ])
  })
})

describe('tempo, meter and key', () => {
  it('defaults to 120 BPM when the score names no tempo', () => {
    const { chart } = parseMusicXml(score([ATTRIBUTES + BAR_OF_C]))

    expect(chart.tempoMap).toEqual([{ atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 }])
  })

  it('records tempo and meter changes at the beat they happen', () => {
    const waltz = '<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>'
    const xml = score([
      ATTRIBUTES + tempo(80) + BAR_OF_C,
      tempo(60) + BAR_OF_D,
      waltz + note({ pitch: 'E4', duration: 3 }),
    ])

    expect(parseMusicXml(xml).chart.tempoMap).toEqual([
      { atBeat: 0, bpm: 80, timeSigNum: 4, timeSigDen: 4 },
      { atBeat: 4, bpm: 60, timeSigNum: 4, timeSigDen: 4 },
      { atBeat: 8, bpm: 60, timeSigNum: 3, timeSigDen: 4 },
    ])
  })

  it('reapplies a tempo marking each time a repeat passes it', () => {
    const xml = score([
      ATTRIBUTES + tempo(80) + BAR_OF_C,
      tempo(60) + BAR_OF_D + repeat('backward', 'right'),
    ])

    expect(parseMusicXml(xml).chart.tempoMap.map((entry) => [entry.atBeat, entry.bpm])).toEqual([
      [0, 80],
      [4, 60],
      [8, 80],
      [12, 60],
    ])
  })

  it('reads a printed metronome mark as quarter notes per minute', () => {
    const mark =
      '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><beat-unit-dot/>' +
      '<per-minute>60</per-minute></metronome></direction-type></direction>'

    expect(parseMusicXml(score([ATTRIBUTES + mark + BAR_OF_C])).chart.tempoMap[0].bpm).toBe(90)
  })

  it('reads the key signature as a count of sharps or flats', () => {
    const flats = ATTRIBUTES.replace('<fifths>0<', '<fifths>-3<')

    expect(parseMusicXml(score([flats + BAR_OF_C])).chart.keySignature).toBe(-3)
  })

  it('lets a pickup bar be as short as it was written', () => {
    const xml = score([ATTRIBUTES + note({ pitch: 'G4', duration: 1 }), BAR_OF_C])

    expect(notesOf(xml)).toEqual([
      [67, 0, 1],
      [60, 1, 4],
    ])
  })
})

describe('score metadata', () => {
  it('reads the title and guesses the instrument from the part', () => {
    const result = parseMusicXml(
      score([ATTRIBUTES + BAR_OF_C], '<work><work-title>Ode to Joy</work-title></work>'),
    )

    expect(result.title).toBe('Ode to Joy')
    expect(result.partName).toBe('Piano')
    expect(result.instrument).toBe('piano')
  })

  it('leaves the title and instrument open when the score names neither', () => {
    const xml = scoreOf([{ id: 'P1', name: 'Kazoo', measures: [ATTRIBUTES + BAR_OF_C] }])
    const result = parseMusicXml(xml)

    expect(result.title).toBeNull()
    expect(result.instrument).toBeNull()
  })
})

describe('unusable input', () => {
  it.each([
    ['text that is not XML', 'not xml <', 'This file is not valid XML.'],
    ['XML that is not a score', '<svg/>', 'This file is not a MusicXML score.'],
    ['a timewise score', '<score-timewise/>', /Timewise MusicXML is not supported/],
    ['a score with only rests', score([ATTRIBUTES + note({ duration: 4 })]), /No playable notes/],
  ])('rejects %s', (_label, xml, message) => {
    expect(() => parseMusicXml(xml)).toThrow(MusicXmlError)
    expect(() => parseMusicXml(xml)).toThrow(message)
  })
})
