/**
 * The in-progress scenario the editor holds before anything is persisted.
 *
 * Field defaults mirror newScenario() and emptyChart() in
 * lib/schema/collections, so an untouched draft is exactly the document the
 * save path writes -- the editor never invents its own defaults. A draft read
 * back out of Firestore goes through draftFromDocuments(), which is what makes
 * a save-then-reopen round trip land on the same state.
 */
import type { MusicXmlImport } from '@/lib/import/musicxml'
import { emptyChart } from '@/lib/schema/collections'
import type {
  Instrument,
  NoteChart,
  Scenario,
  ScenarioVersion,
  TempoMapEntry,
  Visibility,
} from '@/lib/schema/types'

export interface ScenarioDraft {
  title: string
  description: string
  instrument: Instrument
  visibility: Visibility
  /** The author's own grading, 1-10 (user story #32). */
  authorDifficulty: number
  chart: NoteChart
}

/** Matches newUserSettings()'s preferredInstrument until settings are wired up. */
export const DEFAULT_INSTRUMENT: Instrument = 'piano'

/** The part every new chart opens with; multi-part editing is a later story. */
export const DEFAULT_PART_ID = 'lead'

export const INSTRUMENT_LABELS: Record<Instrument, string> = {
  piano: 'Piano',
  guitar: 'Guitar',
  woodwind: 'Woodwind',
  vocals: 'Vocals',
  midi: 'MIDI',
}

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: 'Private -- only you',
  unlisted: 'Unlisted -- anyone with the link',
  public: 'Public -- listed for everyone',
}

/** The "new document" state: no title, one empty lead part at 120bpm 4/4. */
export function emptyDraft(instrument: Instrument = DEFAULT_INSTRUMENT): ScenarioDraft {
  return {
    title: '',
    description: '',
    instrument,
    visibility: 'private',
    authorDifficulty: 1,
    chart: emptyChart(instrument),
  }
}

/** Rebuilds the editor state from a saved scenario and the version it points at. */
export function draftFromDocuments(
  scenario: Scenario,
  version: ScenarioVersion | null,
): ScenarioDraft {
  return {
    title: scenario.title,
    description: scenario.description,
    instrument: scenario.instrument,
    visibility: scenario.visibility,
    authorDifficulty: scenario.authorDifficulty,
    chart: version?.chart ?? emptyChart(scenario.instrument),
  }
}

/**
 * Retargets a draft at another instrument. The chart carries the instrument on
 * each part, so switching it has to reach into the chart rather than only the
 * scenario metadata; notes already written are kept.
 */
export function withInstrument(draft: ScenarioDraft, instrument: Instrument): ScenarioDraft {
  return {
    ...draft,
    instrument,
    chart: {
      ...draft.chart,
      parts: draft.chart.parts.map((part) => ({ ...part, instrument })),
    },
  }
}

/**
 * Replaces the draft's chart with an imported score. The score's title only
 * fills a blank one, and its instrument wins only when the import could tell
 * what it was, so a file never overwrites what the author already chose.
 */
export function withImportedScore(draft: ScenarioDraft, imported: MusicXmlImport): ScenarioDraft {
  return withInstrument(
    {
      ...draft,
      title: draft.title.trim() ? draft.title : (imported.title ?? ''),
      chart: imported.chart,
    },
    imported.instrument ?? draft.instrument,
  )
}

/** Edits the chart's opening tempo and meter, the entry sitting at beat 0. */
export function withOpeningTempo(chart: NoteChart, patch: Partial<TempoMapEntry>): NoteChart {
  return {
    ...chart,
    tempoMap: chart.tempoMap.map((entry, index) => (index === 0 ? { ...entry, ...patch } : entry)),
  }
}

export function noteCount(chart: NoteChart) {
  return chart.parts.reduce((total, part) => total + part.notes.length, 0)
}

/** The opening tempo/meter -- the entry every chart starts with at beat 0. */
export function openingTempo(chart: NoteChart) {
  return chart.tempoMap[0]
}
