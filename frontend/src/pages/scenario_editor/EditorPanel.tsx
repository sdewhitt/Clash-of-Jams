/**
 * The editor's main panel: scenario metadata above, the note grid below.
 *
 * It holds the draft for the whole editing session. With no scenarioId it
 * starts from emptyDraft(); with one it loads that scenario and the version it
 * points at, which is what makes a save-then-reopen round trip land on the
 * notes and metadata that were saved. Saving is refused without a signed-in
 * author or a title, so a half-formed scenario never reaches Firestore.
 */
import { useEffect, useRef, useState } from 'react'

import { PianoRoll } from '@/components/PianoRoll'
import { chartDurationMs } from '@/lib/chart/notes'
import { useAuth } from '@/lib/auth/useAuth'
import { MUSICXML_ACCEPT, importMusicXmlFile } from '@/lib/import/musicxmlFile'
import { loadScenario, saveScenarioDraft } from '@/lib/scenarios/store'
import { INSTRUMENTS, VISIBILITIES } from '@/lib/schema/types'
import type { Instrument, Visibility } from '@/lib/schema/types'
import {
  DEFAULT_PART_ID,
  INSTRUMENT_LABELS,
  VISIBILITY_LABELS,
  draftFromDocuments,
  emptyDraft,
  noteCount,
  openingTempo,
  withImportedScore,
  withInstrument,
  withOpeningTempo,
} from '@/pages/scenario_editor/draft'
import type { ScenarioDraft } from '@/pages/scenario_editor/draft'
import { PlayTest } from '@/pages/scenario_editor/PlayTest'

const FIELD_CLASS =
  'w-full rounded-lg border-2 border-base-middle bg-base-end px-3 py-2 text-ink ' +
  'placeholder:text-faint focus:border-accent-start focus:outline-none transition-colors'

const LABEL_CLASS = 'mb-1 block text-sm font-bold text-muted'

const TIME_SIG_DENOMINATORS = [2, 4, 8, 16]

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'saving' }
  | { kind: 'saved'; versionNumber: number }
  | { kind: 'imported'; fileName: string; notes: number; warnings: string[] }
  | { kind: 'error'; message: string }

interface EditorPanelProps {
  /** The scenario being edited, or null for a blank one. */
  scenarioId: string | null
  /** Called with the id a save landed on, so the URL can follow it. */
  onSaved: (scenarioId: string) => void
  /** Clears the loaded scenario and starts over from the blank state. */
  onStartNew: () => void
}

export function EditorPanel({ scenarioId, onSaved, onStartNew }: EditorPanelProps) {
  const { user } = useAuth()
  const [draft, setDraft] = useState<ScenarioDraft>(emptyDraft)
  const [openId, setOpenId] = useState(scenarioId)
  const [status, setStatus] = useState<Status>(() =>
    scenarioId ? { kind: 'loading' } : { kind: 'idle' },
  )
  const [dirty, setDirty] = useState(false)
  const [playTesting, setPlayTesting] = useState(false)
  // Ids this panel wrote itself, which therefore need no read back.
  const savedHere = useRef<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Resetting during render is React's own answer to "the prop changed, drop
  // the state derived from it"; an effect would paint the old scenario first.
  if (scenarioId !== openId) {
    setOpenId(scenarioId)
    setDraft(emptyDraft())
    setDirty(false)
    setPlayTesting(false)
    setStatus(scenarioId ? { kind: 'loading' } : { kind: 'idle' })
  }

  useEffect(() => {
    if (!scenarioId || savedHere.current === scenarioId) return

    // Guards against an older load resolving after a newer one.
    let cancelled = false
    loadScenario(scenarioId)
      .then(({ scenario, version }) => {
        if (cancelled) return
        setDraft(draftFromDocuments(scenario, version))
        setDirty(false)
        setStatus({ kind: 'idle' })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setStatus({ kind: 'error', message: messageOf(error) })
      })
    return () => {
      cancelled = true
    }
  }, [scenarioId])

  function edit(next: ScenarioDraft) {
    setDraft(next)
    setDirty(true)
    setStatus({ kind: 'idle' })
  }

  async function handleSave() {
    setStatus({ kind: 'saving' })
    try {
      const result = await saveScenarioDraft({ uid: user?.uid ?? null, draft, scenarioId })
      // Adopt the id before the URL carries it back, so the draft in hand
      // stays put instead of being reset and re-read.
      savedHere.current = result.scenarioId
      setOpenId(result.scenarioId)
      setDirty(false)
      setStatus({ kind: 'saved', versionNumber: result.versionNumber })
      onSaved(result.scenarioId)
    } catch (error: unknown) {
      setStatus({ kind: 'error', message: messageOf(error) })
    }
  }

  async function handleImport(file: File) {
    if (
      noteCount(draft.chart) > 0 &&
      !window.confirm('Importing replaces the notes already in this scenario. Continue?')
    ) {
      return
    }
    try {
      const imported = await importMusicXmlFile(file)
      setDraft(withImportedScore(draft, imported))
      setDirty(true)
      setStatus({
        kind: 'imported',
        fileName: file.name,
        notes: noteCount(imported.chart),
        warnings: imported.warnings,
      })
    } catch (error: unknown) {
      setStatus({ kind: 'error', message: messageOf(error) })
    }
  }

  const tempo = openingTempo(draft.chart)
  const notes = noteCount(draft.chart)
  const canSave =
    Boolean(user) && draft.title.trim().length > 0 && status.kind !== 'saving' && dirty

  if (status.kind === 'loading') {
    return <p className="py-12 text-center text-muted">Loading scenario...</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-64 flex-1">
          <label className={LABEL_CLASS} htmlFor="scenario-title">
            Title
          </label>
          <input
            id="scenario-title"
            type="text"
            value={draft.title}
            placeholder="Untitled Scenario"
            onChange={(event) => edit({ ...draft, title: event.target.value })}
            className={FIELD_CLASS}
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="rounded-lg bg-linear-to-b from-accent-start from-50 via-accent-middle
            to-accent-end to-70 px-6 py-3 font-bold text-ink transition-all hover:brightness-125
            active:scale-95 disabled:cursor-not-allowed disabled:bg-base-end disabled:bg-none
            disabled:text-faint disabled:hover:brightness-100"
        >
          {status.kind === 'saving' ? 'Saving...' : scenarioId ? 'Save Version' : 'Save Scenario'}
        </button>

        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="rounded-lg border-2 border-base-middle px-6 py-3 font-bold text-ink
            transition-colors hover:border-accent-start hover:bg-accent-base-middle"
        >
          Import MusicXML
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={MUSICXML_ACCEPT}
          aria-label="MusicXML file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            // Cleared so picking the same file again still fires a change.
            event.target.value = ''
            if (file) void handleImport(file)
          }}
        />

        <button
          type="button"
          onClick={() => setPlayTesting(true)}
          disabled={notes === 0}
          title={notes === 0 ? 'Add some notes to play test this scenario.' : undefined}
          className="rounded-lg border-2 border-base-middle px-6 py-3 font-bold text-ink
            transition-colors hover:border-accent-start hover:bg-accent-base-middle
            disabled:cursor-not-allowed disabled:text-faint disabled:hover:border-base-middle
            disabled:hover:bg-transparent"
        >
          Play Test
        </button>

        {scenarioId && (
          <button
            type="button"
            onClick={onStartNew}
            className="rounded-lg border-2 border-base-middle px-6 py-3 font-bold text-ink
              transition-colors hover:border-accent-start hover:bg-accent-base-middle"
          >
            New Scenario
          </button>
        )}
      </div>

      <SaveStatus status={status} signedIn={Boolean(user)} hasTitle={draft.title.trim() !== ''} />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label className={LABEL_CLASS} htmlFor="scenario-description">
            Description
          </label>
          <input
            id="scenario-description"
            type="text"
            value={draft.description}
            placeholder="What should a player know before they start?"
            onChange={(event) => edit({ ...draft, description: event.target.value })}
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="scenario-instrument">
            Instrument
          </label>
          <select
            id="scenario-instrument"
            value={draft.instrument}
            onChange={(event) => edit(withInstrument(draft, event.target.value as Instrument))}
            className={FIELD_CLASS}
          >
            {INSTRUMENTS.map((instrument) => (
              <option key={instrument} value={instrument}>
                {INSTRUMENT_LABELS[instrument]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="scenario-visibility">
            Visibility
          </label>
          <select
            id="scenario-visibility"
            value={draft.visibility}
            onChange={(event) => edit({ ...draft, visibility: event.target.value as Visibility })}
            className={FIELD_CLASS}
          >
            {VISIBILITIES.map((visibility) => (
              <option key={visibility} value={visibility}>
                {VISIBILITY_LABELS[visibility]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL_CLASS} htmlFor="scenario-tempo">
            Tempo (BPM)
          </label>
          <input
            id="scenario-tempo"
            type="number"
            min={20}
            max={300}
            value={tempo.bpm}
            onChange={(event) =>
              edit({
                ...draft,
                chart: withOpeningTempo(draft.chart, {
                  bpm: clampNumber(Number(event.target.value), 20, 300),
                }),
              })
            }
            className={FIELD_CLASS}
          />
        </div>

        <div>
          <span className={LABEL_CLASS}>Time signature</span>
          <div className="flex items-center gap-2">
            <input
              aria-label="Beats per bar"
              type="number"
              min={1}
              max={16}
              value={tempo.timeSigNum}
              onChange={(event) =>
                edit({
                  ...draft,
                  chart: withOpeningTempo(draft.chart, {
                    timeSigNum: clampNumber(Number(event.target.value), 1, 16),
                  }),
                })
              }
              className={FIELD_CLASS}
            />
            <span className="text-muted">/</span>
            <select
              aria-label="Beat unit"
              value={tempo.timeSigDen}
              onChange={(event) =>
                edit({
                  ...draft,
                  chart: withOpeningTempo(draft.chart, {
                    timeSigDen: Number(event.target.value),
                  }),
                })
              }
              className={FIELD_CLASS}
            >
              {TIME_SIG_DENOMINATORS.map((denominator) => (
                <option key={denominator} value={denominator}>
                  {denominator}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL_CLASS} htmlFor="scenario-difficulty">
            Difficulty -- {draft.authorDifficulty} of 10
          </label>
          <input
            id="scenario-difficulty"
            type="range"
            min={1}
            max={10}
            step={1}
            value={draft.authorDifficulty}
            onChange={(event) => edit({ ...draft, authorDifficulty: Number(event.target.value) })}
            className="w-full accent-accent-start"
          />
        </div>
      </div>

      <PianoRoll
        chart={draft.chart}
        partId={draft.chart.parts[0]?.partId ?? DEFAULT_PART_ID}
        onChange={(chart) => edit({ ...draft, chart })}
      />

      <p className="text-sm text-muted">
        {notes} {notes === 1 ? 'note' : 'notes'} &middot; {tempo.bpm} BPM &middot;{' '}
        {tempo.timeSigNum}/{tempo.timeSigDen} &middot;{' '}
        {(chartDurationMs(draft.chart) / 1000).toFixed(1)}s
      </p>

      {playTesting && (
        <PlayTest draft={draft} uid={user?.uid ?? null} onClose={() => setPlayTesting(false)} />
      )}
    </div>
  )
}

function SaveStatus({
  status,
  signedIn,
  hasTitle,
}: {
  status: Status
  signedIn: boolean
  hasTitle: boolean
}) {
  if (status.kind === 'error') {
    return <p className="text-sm font-bold text-accent-end">{status.message}</p>
  }
  if (status.kind === 'saved') {
    return <p className="text-sm text-muted">Saved as version {status.versionNumber}.</p>
  }
  if (status.kind === 'imported') {
    return (
      <div className="text-sm text-muted">
        <p>
          Imported {status.notes} {status.notes === 1 ? 'note' : 'notes'} from {status.fileName}.
        </p>
        {status.warnings.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-faint">
            {status.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  if (!signedIn) {
    return <p className="text-sm text-faint">Sign in to save this scenario to your library.</p>
  }
  if (!hasTitle) {
    return <p className="text-sm text-faint">Give the scenario a title to enable saving.</p>
  }
  return null
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}
