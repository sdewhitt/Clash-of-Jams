/**
 * User story #29: reading a MusicXML upload off disk, zipped or not.
 */
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { MusicXmlError } from '@/lib/import/musicxml'
import { importMusicXmlFile, musicXmlFromBytes } from '@/lib/import/musicxmlFile'

const SCORE =
  '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0">' +
  '<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>' +
  '<part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>' +
  '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>' +
  '</measure></part></score-partwise>'

const CONTAINER =
  '<?xml version="1.0" encoding="UTF-8"?><container><rootfiles>' +
  '<rootfile full-path="scores/song.xml"/></rootfiles></container>'

describe('musicXmlFromBytes', () => {
  it('returns an uncompressed score as it is', () => {
    expect(musicXmlFromBytes(strToU8(SCORE))).toBe(SCORE)
  })

  it('unzips the score an .mxl container points at', () => {
    const archive = zipSync({
      'META-INF/container.xml': strToU8(CONTAINER),
      'decoy.xml': strToU8('<svg/>'),
      'scores/song.xml': strToU8(SCORE),
    })

    expect(musicXmlFromBytes(archive)).toBe(SCORE)
  })

  it('falls back to the first score file when the container is missing', () => {
    const archive = zipSync({ 'song.musicxml': strToU8(SCORE) })

    expect(musicXmlFromBytes(archive)).toBe(SCORE)
  })

  it('decodes a UTF-16 score by its byte order mark', () => {
    const bytes = new Uint8Array(2 + SCORE.length * 2)
    bytes.set([0xff, 0xfe])
    for (let i = 0; i < SCORE.length; i++) bytes[2 + i * 2] = SCORE.charCodeAt(i)

    expect(musicXmlFromBytes(bytes)).toBe(SCORE)
  })

  it('rejects an archive with no score in it', () => {
    const archive = zipSync({ 'notes.txt': strToU8('hello') })

    expect(() => musicXmlFromBytes(archive)).toThrow(MusicXmlError)
  })

  it('rejects a damaged archive', () => {
    expect(() => musicXmlFromBytes(strToU8('PK not really a zip'))).toThrow(MusicXmlError)
  })
})

describe('importMusicXmlFile', () => {
  it('parses a zipped upload into a chart', async () => {
    const archive = zipSync({
      'META-INF/container.xml': strToU8(CONTAINER),
      'scores/song.xml': strToU8(SCORE),
    })
    const result = await importMusicXmlFile(new File([archive], 'song.mxl'))

    expect(result.chart.parts[0].notes).toMatchObject([
      { midiPitch: 60, startBeat: 0, durationBeats: 4 },
    ])
  })
})
