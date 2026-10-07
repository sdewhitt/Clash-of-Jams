/**
 * User story #25: the "new doc" state a scenario starts from.
 *
 * The editor's defaults have to match the schema factories, otherwise an
 * untouched draft would save as something other than what was shown.
 */
import { describe, expect, it } from 'vitest'

import type { MusicXmlImport } from '@/lib/import/musicxml'
import { emptyChart, newScenario } from '@/lib/schema/collections'
import {
  DEFAULT_INSTRUMENT,
  draftFromDocuments,
  emptyDraft,
  noteCount,
  openingTempo,
  withImportedScore,
  withInstrument,
  withOpeningTempo,
} from '@/pages/scenario_editor/draft'
import type { Scenario, ScenarioVersion } from '@/lib/schema/types'

describe('emptyDraft', () => {
  it('starts with blank metadata and an empty note list', () => {
    const draft = emptyDraft()

    expect(draft.title).toBe('')
    expect(draft.description).toBe('')
    expect(draft.instrument).toBe(DEFAULT_INSTRUMENT)
    expect(draft.visibility).toBe('private')
    expect(draft.authorDifficulty).toBe(1)
    expect(noteCount(draft.chart)).toBe(0)
  })

  it('opens at 120 BPM in 4/4 with a single lead part', () => {
    const draft = emptyDraft()

    expect(openingTempo(draft.chart)).toEqual({
      atBeat: 0,
      bpm: 120,
      timeSigNum: 4,
      timeSigDen: 4,
    })
    expect(draft.chart.parts.map((part) => part.partId)).toEqual(['lead'])
  })

  it('matches the defaults the scenario factory would write', () => {
    const draft = emptyDraft()
    const document = newScenario({
      id: 'x',
      authorUid: 'user-1',
      title: 'x',
      instrument: draft.instrument,
    })

    expect(document.visibility).toBe(draft.visibility)
    expect(document.authorDifficulty).toBe(draft.authorDifficulty)
  })
})

describe('withInstrument', () => {
  it('retargets the chart parts as well as the metadata', () => {
    const after = withInstrument(emptyDraft(), 'guitar')

    expect(after.instrument).toBe('guitar')
    expect(after.chart.parts.map((part) => part.instrument)).toEqual(['guitar'])
  })
})

describe('withImportedScore', () => {
  const imported: MusicXmlImport = {
    title: 'Ode to Joy',
    partName: 'Classical Guitar',
    instrument: 'guitar',
    chart: {
      keySignature: 2,
      tempoMap: [{ atBeat: 0, bpm: 96, timeSigNum: 3, timeSigDen: 4 }],
      parts: [
        {
          partId: 'lead',
          name: 'Classical Guitar',
          instrument: 'piano',
          notes: [{ index: 0, midiPitch: 60, startBeat: 0, durationBeats: 1, velocity: 80 }],
        },
      ],
    },
    warnings: [],
  }

  it('takes the chart, title and instrument from the score', () => {
    const after = withImportedScore(emptyDraft(), imported)

    expect(after.title).toBe('Ode to Joy')
    expect(after.instrument).toBe('guitar')
    expect(after.chart.parts.map((part) => part.instrument)).toEqual(['guitar'])
    expect(after.chart.keySignature).toBe(2)
    expect(openingTempo(after.chart)).toMatchObject({ bpm: 96, timeSigNum: 3 })
    expect(noteCount(after.chart)).toBe(1)
  })

  it('keeps a title the author already typed and the rest of the metadata', () => {
    const before = { ...emptyDraft(), title: 'My Drill', description: 'Slow', authorDifficulty: 4 }
    const after = withImportedScore(before, imported)

    expect(after).toMatchObject({ title: 'My Drill', description: 'Slow', authorDifficulty: 4 })
  })

  it('keeps the chosen instrument when the score does not say what it is for', () => {
    const before = withInstrument(emptyDraft(), 'vocals')
    const after = withImportedScore(before, { ...imported, title: null, instrument: null })

    expect(after.title).toBe('')
    expect(after.instrument).toBe('vocals')
    expect(after.chart.parts.map((part) => part.instrument)).toEqual(['vocals'])
  })
})

describe('withOpeningTempo', () => {
  it('edits the entry at beat zero', () => {
    const chart = withOpeningTempo(emptyChart('piano'), { bpm: 90, timeSigNum: 3 })

    expect(openingTempo(chart)).toMatchObject({ atBeat: 0, bpm: 90, timeSigNum: 3, timeSigDen: 4 })
  })
})

describe('draftFromDocuments', () => {
  const scenario = {
    title: 'Saved',
    description: 'Notes',
    instrument: 'guitar',
    visibility: 'public',
    authorDifficulty: 7,
  } as Scenario

  it('rebuilds the editor state from a scenario and its version', () => {
    const version = { chart: emptyChart('guitar') } as ScenarioVersion

    expect(draftFromDocuments(scenario, version)).toEqual({
      title: 'Saved',
      description: 'Notes',
      instrument: 'guitar',
      visibility: 'public',
      authorDifficulty: 7,
      chart: version.chart,
    })
  })

  it('falls back to an empty chart when no version was ever written', () => {
    const draft = draftFromDocuments(scenario, null)

    expect(noteCount(draft.chart)).toBe(0)
    expect(draft.chart.parts[0].instrument).toBe('guitar')
  })
})
