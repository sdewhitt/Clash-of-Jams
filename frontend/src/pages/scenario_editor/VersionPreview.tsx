/**
 * One saved version, read only. Editing an old version in place would fork the
 * history, so the only way to work from it is to revert to it. It reads the
 * version named in the URL, which keeps the view across a refresh, and says so
 * plainly when a revert has since deleted that version.
 */
import { useEffect, useState } from 'react'

import { PianoRoll } from '@/components/PianoRoll'
import { chartDurationMs } from '@/lib/chart/notes'
import { loadScenario } from '@/lib/scenarios/store'
import type { ScenarioVersion } from '@/lib/schema/types'
import { DEFAULT_PART_ID, noteCount, openingTempo } from '@/pages/scenario_editor/draft'
import { EmptyState } from '@/pages/scenario_editor/EmptyState'
import {
  QUIET_BUTTON,
  describeSettings,
  formatSavedAt,
  versionLabel,
} from '@/pages/scenario_editor/versions'

type Loaded =
  | { kind: 'loading' }
  | { kind: 'found'; version: ScenarioVersion }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

interface VersionPreviewProps {
  scenarioId: string
  versionId: string
  currentVersionId: string | null
  busy: boolean
  /** A failed revert, reported by the panel that attempted it. */
  notice: string | null
  onBack: () => void
  onOpenLatest: () => void
  onRevert: (version: ScenarioVersion) => void
}

export function VersionPreview({
  scenarioId,
  versionId,
  currentVersionId,
  busy,
  notice,
  onBack,
  onOpenLatest,
  onRevert,
}: VersionPreviewProps) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' })
  const [loadedFor, setLoadedFor] = useState(versionId)

  // Same reset-during-render as EditorPanel: never paint the previous version.
  if (versionId !== loadedFor) {
    setLoadedFor(versionId)
    setLoaded({ kind: 'loading' })
  }

  useEffect(() => {
    let cancelled = false
    loadScenario(scenarioId, versionId)
      .then(({ version }) => {
        if (cancelled) return
        setLoaded(version ? { kind: 'found', version } : { kind: 'missing' })
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setLoaded({
          kind: 'error',
          message: cause instanceof Error ? cause.message : 'Could not load this version.',
        })
      })
    return () => {
      cancelled = true
    }
  }, [scenarioId, versionId])

  if (loaded.kind === 'loading') {
    return <p className="py-12 text-center text-muted">Loading version...</p>
  }
  if (loaded.kind !== 'found') {
    return (
      <EmptyState
        title="This version is no longer available"
        action={{ label: 'Back to Version History', onClick: onBack }}
      >
        {loaded.kind === 'error'
          ? loaded.message
          : 'It may have been deleted when the scenario was reverted to an earlier version.'}
      </EmptyState>
    )
  }

  const { version } = loaded
  const isCurrent = version.id === currentVersionId
  const tempo = openingTempo(version.chart)
  const notes = noteCount(version.chart)

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2
          border-accent-start bg-base-end px-6 py-4"
      >
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-2xl font-bold wrap-break-word text-ink">{versionLabel(version)}</h2>
          <p className="text-sm text-muted">
            Read only &middot; saved {formatSavedAt(version.createdAt)}
            {isCurrent ? ' · current version' : ''}
          </p>
          <p className="text-sm wrap-break-word text-faint">{describeSettings(version)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onBack} className={QUIET_BUTTON}>
            Back to Version History
          </button>
          <button type="button" onClick={onOpenLatest} className={QUIET_BUTTON}>
            Open Latest in Editor
          </button>
          {!isCurrent && (
            <button
              type="button"
              onClick={() => onRevert(version)}
              disabled={busy}
              className={QUIET_BUTTON}
            >
              Revert to This Version
            </button>
          )}
        </div>
      </div>

      {notice && (
        <p role="alert" className="text-sm font-bold text-accent-end">
          {notice}
        </p>
      )}

      <PianoRoll
        chart={version.chart}
        partId={version.chart.parts[0]?.partId ?? DEFAULT_PART_ID}
        onChange={() => {}}
        readOnly
      />

      <p className="text-sm text-muted">
        {notes} {notes === 1 ? 'note' : 'notes'} &middot; {tempo.bpm} BPM &middot;{' '}
        {tempo.timeSigNum}/{tempo.timeSigDen} &middot;{' '}
        {(chartDurationMs(version.chart) / 1000).toFixed(1)}s
      </p>
    </div>
  )
}
