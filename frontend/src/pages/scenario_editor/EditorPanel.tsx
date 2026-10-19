/**
 * The editor's main panel: scenario metadata above, the note grid below.
 *
 * It holds the draft for the whole editing session. With no scenarioId it
 * starts from emptyDraft(); with one it loads that scenario and the version it
 * points at, which is what makes a save-then-reopen round trip land on the
 * notes and metadata that were saved. Saving is refused without a signed-in
 * author or a title, so a half-formed scenario never reaches Firestore.
 *
 * Notes can also come from outside the grid: a MusicXML or MIDI file replaces
 * the chart, and a MIDI controller records into it (user stories #26 and #30).
 * Any chart can be exported back out as a .mid file.
 */
import { useEffect, useRef, useState } from 'react'

import { PianoRoll } from '@/components/PianoRoll'
import { addNotes } from '@/lib/chart/edits'
import type { NoteInput } from '@/lib/chart/edits'
import { chartDurationMs } from '@/lib/chart/notes'
import { useAuth } from '@/lib/auth/useAuth'
import { downloadBytes, fileNameFor } from '@/lib/download'
import { MIDI_ACCEPT, chartToMidi, midiTrackImport, readMidiUpload } from '@/lib/import/midiFile'
import type { MidiFile, MidiImport } from '@/lib/import/midiFile'
import type { MusicXmlImport } from '@/lib/import/musicxml'
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
import { MidiRecordPanel } from '@/pages/scenario_editor/MidiRecordPanel'
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
  // The id this panel wrote itself, which therefore needs no read back.
  const [savedHere, setSavedHere] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const midiInput = useRef<HTMLInputElement>(null)
  // A multi-track MIDI file waiting for the author to pick a track.
  const [pendingMidi, setPendingMidi] = useState<{ file: MidiFile; fileName: string } | null>(null)
  // A MIDI take in progress, drawn over the chart until it is committed.
  const [take, setTake] = useState<{ notes: NoteInput[]; replace: boolean } | null>(null)

  // Resetting during render is React's own answer to "the prop changed, drop
  // the state derived from it"; an effect would paint the old scenario first.
  // The exception is the URL catching up with a save made here: the draft in
  // hand is already that scenario, so it stays put.
  if (scenarioId !== openId) {
    setOpenId(scenarioId)
    if (scenarioId === null || scenarioId !== savedHere) {
      setSavedHere(null)
      setDraft(emptyDraft())
      setDirty(false)
      setPlayTesting(false)
      setPendingMidi(null)
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
  }, [scenarioId, savedHere])

  function edit(next: ScenarioDraft) {
    setDraft(next)
    setDirty(true)
    setStatus({ kind: 'idle' })
  }

  async function handleSave() {
    setStatus({ kind: 'saving' })
    try {
      const result = await saveScenarioDraft({ uid: user?.uid ?? null, draft, scenarioId })
      setSavedHere(result.scenarioId)
      setDirty(false)
      setStatus({ kind: 'saved', versionNumber: result.versionNumber })
      onSaved(result.scenarioId)
    } catch (error: unknown) {
      setStatus({ kind: 'error', message: messageOf(error) })
    }
  }

  function confirmReplace() {
    return (
      noteCount(draft.chart) === 0 ||
      window.confirm('Importing replaces the notes already in this scenario. Continue?')
    )
  }

  function applyImport(imported: MusicXmlImport | MidiImport, fileName: string) {
    setDraft(withImportedScore(draft, imported))
    setDirty(true)
    setStatus({
      kind: 'imported',
      fileName,
      notes: noteCount(imported.chart),
      warnings: imported.warnings,
    })
  }

  async function handleImport(file: File) {
    if (!confirmReplace()) return
    try {
      applyImport(await importMusicXmlFile(file), file.name)
    } catch (error: unknown) {
      setStatus({ kind: 'error', message: messageOf(error) })
    }
  }

  /** A one-track file imports straight away; with more, the author picks which one. */
  async function handleMidiImport(file: File) {
    try {
      const midi = await readMidiUpload(file)
      if (midi.tracks.length > 1) {
        setPendingMidi({ file: midi, fileName: file.name })
        return
      }
      if (!confirmReplace()) return
      applyImport(midiTrackImport(midi, midi.tracks[0].trackIndex), file.name)
    } catch (error: unknown) {
      setStatus({ kind: 'error', message: messageOf(error) })
    }
  }

  function handleTrackChosen(trackIndex: number) {
    if (!pendingMidi) return
    const { file, fileName } = pendingMidi
    setPendingMidi(null)
    if (!confirmReplace()) return
    try {
      applyImport(midiTrackImport(file, trackIndex), fileName)
    } catch (error: unknown) {
      setStatus({ kind: 'error', message: messageOf(error) })
    }
  }

  function handleExport() {
    const bytes = chartToMidi(draft.chart, draft.title.trim())
    downloadBytes(bytes, `${fileNameFor(draft.title)}.mid`, 'audio/midi')
  }

  const tempo = openingTempo(draft.chart)
  const partId = draft.chart.parts[0]?.partId ?? DEFAULT_PART_ID
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
          onClick={() => midiInput.current?.click()}
          className="rounded-lg border-2 border-base-middle px-6 py-3 font-bold text-ink
            transition-colors hover:border-accent-start hover:bg-accent-base-middle"
        >
          Import MIDI
        </button>
        <input
          ref={midiInput}
          type="file"
          accept={MIDI_ACCEPT}
          aria-label="MIDI file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void handleMidiImport(file)
          }}
        />

        <button
          type="button"
          onClick={handleExport}
          disabled={notes === 0}
          title={notes === 0 ? 'Add some notes to export this scenario.' : undefined}
          className="rounded-lg border-2 border-base-middle px-6 py-3 font-bold text-ink
            transition-colors hover:border-accent-start hover:bg-accent-base-middle
            disabled:cursor-not-allowed disabled:text-faint disabled:hover:border-base-middle
            disabled:hover:bg-transparent"
        >
          Export MIDI
        </button>

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

      <MidiRecordPanel
        chart={draft.chart}
        uid={user?.uid ?? null}
        onPreview={setTake}
        onCommit={(recorded, replace) =>
          edit({ ...draft, chart: addNotes(draft.chart, partId, recorded, { replace }) })
        }
      />

      <PianoRoll
        chart={
          take ? addNotes(draft.chart, partId, take.notes, { replace: take.replace }) : draft.chart
        }
        partId={partId}
        readOnly={take !== null}
        onChange={(chart) => edit({ ...draft, chart })}
      />

      <p className="text-sm text-muted">
        {notes} {notes === 1 ? 'note' : 'notes'} &middot; {tempo.bpm} BPM &middot;{' '}
        {tempo.timeSigNum}/{tempo.timeSigDen} &middot;{' '}
        {(chartDurationMs(draft.chart) / 1000).toFixed(1)}s
      </p>

      {pendingMidi && (
        <MidiTrackPicker
          fileName={pendingMidi.fileName}
          tracks={pendingMidi.file.tracks}
          onPick={handleTrackChosen}
          onCancel={() => setPendingMidi(null)}
        />
      )}

      {playTesting && (
        <PlayTest draft={draft} uid={user?.uid ?? null} onClose={() => setPlayTesting(false)} />
      )}
    </div>
  )
}

function MidiTrackPicker({
  fileName,
  tracks,
  onPick,
  onCancel,
}: {
  fileName: string
  tracks: MidiFile['tracks']
  onPick: (trackIndex: number) => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="midi-track-title"
        onKeyDown={(event) => event.key === 'Escape' && onCancel()}
        className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-xl
          border-4 border-accent-start bg-base-start p-6"
      >
        <h2 id="midi-track-title" className="text-xl font-bold text-ink">
          Choose a track
        </h2>
        <p className="text-sm text-muted">
          {fileName} has {tracks.length} tracks. A scenario is one part, so pick the one to play.
        </p>
        <ul className="flex flex-col gap-2">
          {tracks.map((track) => (
            <li key={track.trackIndex}>
              <button
                type="button"
                onClick={() => onPick(track.trackIndex)}
                className="flex w-full items-center justify-between rounded-lg border-2
                  border-base-middle px-4 py-2 text-left text-ink transition-colors
                  hover:border-accent-start hover:bg-accent-base-middle"
              >
                <span className="font-bold">{track.name}</span>
                <span className="text-sm text-muted">
                  {track.noteCount} {track.noteCount === 1 ? 'note' : 'notes'}
                  {track.percussion ? ' -- drums' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          autoFocus
          onClick={onCancel}
          className="self-end rounded-lg border-2 border-base-middle px-4 py-2 text-sm font-bold
            text-ink hover:border-accent-start"
        >
          Cancel
        </button>
      </div>
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
