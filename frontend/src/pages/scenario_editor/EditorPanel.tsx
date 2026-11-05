/**
 * The editor's main panel: scenario metadata above, the note grid below.
 *
 * It holds the draft for the whole editing session. With no scenarioId it
 * starts from emptyDraft(); with one it loads that scenario and the version it
 * points at, which is what makes a save-then-reopen round trip land on the
 * notes and metadata that were saved. Saving is refused without a signed-in
 * author or a title, so a half-formed scenario never reaches Firestore.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import { PianoRoll } from '@/components/PianoRoll'
import { chartDurationMs } from '@/lib/chart/notes'
import { useAuth } from '@/lib/auth/useAuth'
import { MUSICXML_ACCEPT, importMusicXmlFile } from '@/lib/import/musicxmlFile'
import { ScenarioConflictError, loadScenario, saveScenarioDraft } from '@/lib/scenarios/store'
import { INSTRUMENTS, VISIBILITIES } from '@/lib/schema/types'
import type { Instrument, Visibility } from '@/lib/schema/types'
import {
  DEFAULT_PART_ID,
  INSTRUMENT_LABELS,
  VISIBILITY_LABELS,
  draftFromDocuments,
  draftsEqual,
  emptyDraft,
  noteCount,
  openingTempo,
  withImportedScore,
  withInstrument,
  withOpeningTempo,
} from '@/pages/scenario_editor/draft'
import type { ScenarioDraft } from '@/pages/scenario_editor/draft'
import {
  clearRecoverableDraft,
  readRecoverableDraft,
  writeRecoverableDraft,
} from '@/pages/scenario_editor/draftRecovery'
import type { RecoverableDraft } from '@/pages/scenario_editor/draftRecovery'
import { PlayTest } from '@/pages/scenario_editor/PlayTest'

const FIELD_CLASS =
  'w-full rounded-lg border-2 border-base-middle bg-base-end px-3 py-2 text-ink ' +
  'placeholder:text-faint focus:border-accent-start focus:outline-none transition-colors'

const LABEL_CLASS = 'mb-1 block text-sm font-bold text-muted'

const TIME_SIG_DENOMINATORS = [2, 4, 8, 16]

/** firestore.rules caps a scenario title at this length. */
const TITLE_MAX_LENGTH = 120
const COPY_SUFFIX = ' (copy)'

const NOTICE_CLASS =
  'flex flex-wrap items-center gap-3 rounded-xl border-2 border-accent-start bg-base-end px-4 py-3'
const NOTICE_BUTTON_CLASS =
  'rounded-lg border-2 border-base-middle px-4 py-2 text-sm font-bold text-ink ' +
  'transition-colors hover:border-accent-start hover:bg-accent-base-middle'

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'saving' }
  | { kind: 'saved'; versionNumber: number }
  | { kind: 'visibility' }
  | { kind: 'conflict' }
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
  const uid = user?.uid ?? null
  const [draft, setDraft] = useState<ScenarioDraft>(emptyDraft)
  const [openId, setOpenId] = useState(scenarioId)
  const [status, setStatus] = useState<Status>(() =>
    scenarioId ? { kind: 'loading' } : { kind: 'idle' },
  )
  // What a save would be compared against: the last saved or loaded state.
  const [baseline, setBaseline] = useState<ScenarioDraft>(emptyDraft)
  // The version the draft started from; a save checks it is still the current one.
  const [baseVersionId, setBaseVersionId] = useState<string | null>(null)
  const [reloads, setReloads] = useState(0)
  const [recoverable, setRecoverable] = useState<RecoverableDraft | null>(null)
  const [playTesting, setPlayTesting] = useState(false)
  // The id this panel wrote itself, which therefore needs no read back.
  const [savedHere, setSavedHere] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Resetting during render is React's own answer to "the prop changed, drop
  // the state derived from it"; an effect would paint the old scenario first.
  // The exception is the URL catching up with a save made here: the draft in
  // hand is already that scenario, so it stays put.
  if (scenarioId !== openId) {
    setOpenId(scenarioId)
    if (scenarioId === null || scenarioId !== savedHere) {
      setSavedHere(null)
      setDraft(emptyDraft())
      setBaseline(emptyDraft())
      setBaseVersionId(null)
      setRecoverable(null)
      setPlayTesting(false)
      setStatus(scenarioId ? { kind: 'loading' } : { kind: 'idle' })
    }
  }

  useEffect(() => {
    if (!scenarioId || savedHere === scenarioId) return

    // Guards against an older load resolving after a newer one.
    let cancelled = false
    loadScenario(scenarioId)
      .then(({ scenario, version }) => {
        if (cancelled) return
        const loaded = draftFromDocuments(scenario, version)
        setDraft(loaded)
        setBaseline(loaded)
        setBaseVersionId(scenario.currentVersionId)
        setStatus({ kind: 'idle' })
        offerRecovery(loaded)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setStatus({ kind: 'error', message: messageOf(error) })
      })
    return () => {
      cancelled = true
    }
    // offerRecovery only reads uid and scenarioId, which are covered here.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId, savedHere, reloads, uid])

  // A blank scenario has nothing to load, so its recovery check happens here.
  useEffect(() => {
    if (!scenarioId) offerRecovery(emptyDraft())
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId, uid])

  // Keeps unsaved work in this browser. Paused while a recovery offer is open,
  // so it cannot overwrite the draft being offered.
  useEffect(() => {
    if (!uid || recoverable || status.kind === 'loading') return
    const timer = setTimeout(() => {
      if (draftsEqual(draft, baseline)) clearRecoverableDraft(uid, scenarioId)
      else writeRecoverableDraft(uid, scenarioId, { draft, baseVersionId, savedAt: Date.now() })
    }, 500)
    return () => clearTimeout(timer)
  }, [uid, scenarioId, draft, baseline, baseVersionId, recoverable, status.kind])

  function offerRecovery(saved: ScenarioDraft) {
    if (!uid) return
    const stored = readRecoverableDraft(uid, scenarioId)
    if (!stored) return
    if (draftsEqual(stored.draft, saved)) clearRecoverableDraft(uid, scenarioId)
    else setRecoverable(stored)
  }

  function restoreRecovered(stored: RecoverableDraft) {
    setDraft(stored.draft)
    setBaseVersionId(stored.baseVersionId)
    setRecoverable(null)
  }

  function discardRecovered() {
    if (uid) clearRecoverableDraft(uid, scenarioId)
    setRecoverable(null)
  }

  function reloadLatest() {
    if (uid) clearRecoverableDraft(uid, scenarioId)
    setSavedHere(null)
    setStatus({ kind: 'loading' })
    setReloads((count) => count + 1)
  }

  async function handleSaveAsCopy() {
    setStatus({ kind: 'saving' })
    try {
      // Private, so a copy of a draft is never published by accident.
      const copy: ScenarioDraft = {
        ...draft,
        title: draft.title.trim().slice(0, TITLE_MAX_LENGTH - COPY_SUFFIX.length) + COPY_SUFFIX,
        visibility: 'private',
      }
      const result = await saveScenarioDraft({ uid, draft: copy })
      if (uid) clearRecoverableDraft(uid, scenarioId)
      setSavedHere(result.scenarioId)
      setDraft(copy)
      setBaseline(copy)
      setBaseVersionId(result.versionId)
      setStatus({ kind: 'saved', versionNumber: result.versionNumber })
      onSaved(result.scenarioId)
    } catch (error: unknown) {
      setStatus({ kind: 'error', message: messageOf(error) })
    }
  }

  function edit(next: ScenarioDraft) {
    setDraft(next)
    setStatus({ kind: 'idle' })
  }

  async function handleSave() {
    setStatus({ kind: 'saving' })
    try {
      const result = await saveScenarioDraft({
        uid,
        draft,
        scenarioId,
        ...(scenarioId ? { baseVersionId } : {}),
      })
      if (uid) clearRecoverableDraft(uid, scenarioId)
      setSavedHere(result.scenarioId)
      setBaseline(draft)
      setBaseVersionId(result.versionId)
      setStatus(
        result.outcome === 'visibility'
          ? { kind: 'visibility' }
          : { kind: 'saved', versionNumber: result.versionNumber },
      )
      onSaved(result.scenarioId)
    } catch (error: unknown) {
      setStatus(
        error instanceof ScenarioConflictError
          ? { kind: 'conflict' }
          : { kind: 'error', message: messageOf(error) },
      )
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
  const unchanged = useMemo(() => draftsEqual(draft, baseline), [draft, baseline])
  const canSave =
    Boolean(user) && draft.title.trim().length > 0 && status.kind !== 'saving' && !unchanged

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
          title={unchanged ? 'No changes since the last save.' : undefined}
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

      {status.kind === 'conflict' && (
        <div role="alert" className={NOTICE_CLASS}>
          <p className="min-w-0 flex-1 basis-64 text-sm text-ink">
            This scenario was saved somewhere else since you opened it. Your edits are still here
            and nothing was overwritten.
          </p>
          <button type="button" onClick={reloadLatest} className={NOTICE_BUTTON_CLASS}>
            Reload Latest
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAsCopy()}
            className={NOTICE_BUTTON_CLASS}
          >
            Save as Copy
          </button>
        </div>
      )}

      {recoverable && (
        <div role="status" className={NOTICE_CLASS}>
          <p className="min-w-0 flex-1 basis-64 text-sm text-ink">
            You have unsaved work from {new Date(recoverable.savedAt).toLocaleString()}.
          </p>
          <button
            type="button"
            onClick={() => restoreRecovered(recoverable)}
            className={NOTICE_BUTTON_CLASS}
          >
            Restore Draft
          </button>
          <button type="button" onClick={discardRecovered} className={NOTICE_BUTTON_CLASS}>
            Discard Draft
          </button>
        </div>
      )}

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
  if (status.kind === 'visibility') {
    return <p className="text-sm text-muted">Visibility updated. No new version was needed.</p>
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
