/**
 * User story #25: the "new doc" state a scenario starts from.
 *
 * The editor's defaults have to match the schema factories, otherwise an
 * untouched draft would save as something other than what was shown.
 */
import { describe, expect, it } from 'vitest'

import { emptyChart, newScenario } from '@/lib/schema/collections'
import {
  DEFAULT_INSTRUMENT,
  draftFromDocuments,
  emptyDraft,
  noteCount,
  openingTempo,
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
