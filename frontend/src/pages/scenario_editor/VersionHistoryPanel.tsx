/**
 * The editor's "Version History" tab: every saved version of one scenario,
 * newest first, each of which can be viewed, named, shared or reverted to.
 *
 * Versions are strictly linear. An old version cannot be edited directly, and
 * reverting to one deletes everything after it, so the list is always a single
 * line ending at the scenario's current version.
 */
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { useAuth } from '@/lib/auth/useAuth'
import {
  ScenarioConflictError,
  VERSION_PAGE_SIZE,
  listScenarioVersions,
  loadScenario,
  renameScenarioVersion,
  revertToVersion,
} from '@/lib/scenarios/store'
import { VERSION_NAME_MAX_LENGTH } from '@/lib/schema/collections'
import type { Scenario, ScenarioVersion } from '@/lib/schema/types'
import { noteCount } from '@/pages/scenario_editor/draft'
import { EmptyState } from '@/pages/scenario_editor/EmptyState'
import { VersionPreview } from '@/pages/scenario_editor/VersionPreview'
import {
  QUIET_BUTTON,
  describeSettings,
  formatSavedAt,
  revertWarning,
  versionLabel,
  versionShareUrl,
} from '@/pages/scenario_editor/versions'

type Notice = { kind: 'info' | 'error'; message: string }

interface VersionHistoryPanelProps {
  scenarioId: string
  /** The version being viewed, or null for the list. */
  versionId: string | null
  onViewVersion: (versionId: string | null) => void
  /** Goes to the editor, holding the scenario's current version. */
  onOpenLatest: () => void
  /** Called after a revert, so the editor can drop what it was holding. */
  onReverted: () => void
}

export function VersionHistoryPanel({
  scenarioId,
  versionId,
  onViewVersion,
  onOpenLatest,
  onReverted,
}: VersionHistoryPanelProps) {
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [versions, setVersions] = useState<ScenarioVersion[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshes, setRefreshes] = useState(0)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [busy, setBusy] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { scenario: found } = await loadScenario(scenarioId)
      // Checked before asking for the versions: this view is for the author.
      const page = found.authorUid === uid ? await listScenarioVersions(scenarioId) : []
      if (cancelled) return
      setScenario(found)
      setVersions(page)
    }

    load().catch((cause: unknown) => {
      if (!cancelled) setLoadError(messageOf(cause))
    })
    return () => {
      cancelled = true
    }
  }, [scenarioId, uid, refreshes])

  if (loadError) {
    return <EmptyState title="Could not load this history">{loadError}</EmptyState>
  }
  if (!scenario) {
    return <p className="py-12 text-center text-muted">Loading version history...</p>
  }
  if (scenario.authorUid !== uid) {
    return (
      <EmptyState title="This history is private">
        Only a scenario&apos;s author can see its version history.
      </EmptyState>
    )
  }

  const oldest = versions.at(-1)
  const hasOlder = oldest !== undefined && oldest.versionNumber > 1

  async function loadOlder() {
    if (!oldest) return
    setBusy(true)
    try {
      const older = await listScenarioVersions(scenarioId, oldest.versionNumber)
      setVersions((current) => [...current, ...older])
    } catch (cause: unknown) {
      setNotice({ kind: 'error', message: messageOf(cause) })
    } finally {
      setBusy(false)
    }
  }

  async function handleRename(version: ScenarioVersion, name: string) {
    setBusy(true)
    setNotice(null)
    try {
      const stored = await renameScenarioVersion({ scenarioId, versionId: version.id, name })
      setVersions((current) =>
        current.map((entry) => (entry.id === version.id ? { ...entry, name: stored } : entry)),
      )
      setRenamingId(null)
    } catch (cause: unknown) {
      setNotice({ kind: 'error', message: messageOf(cause) })
    } finally {
      setBusy(false)
    }
  }

  async function handleCopyLink(version: ScenarioVersion) {
    setNotice(null)
    try {
      await navigator.clipboard.writeText(
        versionShareUrl(scenarioId, version.id, window.location.origin),
      )
      setNotice({
        kind: 'info',
        message:
          scenario?.visibility === 'private'
            ? `Link to version ${version.versionNumber} copied. This scenario is private, so only you can open it.`
            : `Link to version ${version.versionNumber} copied.`,
      })
    } catch {
      setNotice({ kind: 'error', message: 'Could not copy the link.' })
    }
  }

  async function handleRevert(version: ScenarioVersion, current: Scenario) {
    const warning = revertWarning(version.versionNumber, current.currentVersionNumber)
    if (!window.confirm(warning)) return

    setBusy(true)
    setNotice(null)
    try {
      const result = await revertToVersion({
        uid,
        scenarioId,
        targetVersionId: version.id,
        expectedCurrentVersionId: current.currentVersionId,
      })
      const plural = result.deletedCount === 1 ? 'version' : 'versions'
      setNotice({
        kind: 'info',
        message: `Reverted to version ${result.versionNumber}. Deleted ${result.deletedCount} later ${plural}.`,
      })
      onReverted()
      onViewVersion(null)
      setRefreshes((count) => count + 1)
    } catch (cause: unknown) {
      setNotice({ kind: 'error', message: messageOf(cause) })
      // Someone else moved the scenario, so what is on screen is out of date.
      if (cause instanceof ScenarioConflictError) setRefreshes((count) => count + 1)
    } finally {
      setBusy(false)
    }
  }

  if (versionId) {
    return (
      <VersionPreview
        scenarioId={scenarioId}
        versionId={versionId}
        currentVersionId={scenario.currentVersionId}
        busy={busy}
        notice={notice?.kind === 'error' ? notice.message : null}
        onBack={() => {
          setNotice(null)
          onViewVersion(null)
        }}
        onOpenLatest={onOpenLatest}
        onRevert={(version) => void handleRevert(version, scenario)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="min-w-0 text-2xl font-bold wrap-break-word text-ink">{scenario.title}</h2>
        <button type="button" onClick={onOpenLatest} className={QUIET_BUTTON}>
          Open Latest in Editor
        </button>
      </div>

      {notice && (
        <p
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={
            notice.kind === 'error' ? 'text-sm font-bold text-accent-end' : 'text-sm text-muted'
          }
        >
          {notice.message}
        </p>
      )}

      {versions.length === 0 ? (
        <EmptyState title="No saved versions yet">
          Each time this scenario is saved with changes, a version will appear here.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {versions.map((version) => (
            <VersionRow
              key={version.id}
              version={version}
              isCurrent={version.id === scenario.currentVersionId}
              isRenaming={renamingId === version.id}
              busy={busy}
              onView={() => onViewVersion(version.id)}
              onStartRename={() => setRenamingId(version.id)}
              onCancelRename={() => setRenamingId(null)}
              onRename={(name) => void handleRename(version, name)}
              onCopyLink={() => void handleCopyLink(version)}
              onRevert={() => void handleRevert(version, scenario)}
            />
          ))}
        </ul>
      )}

      {hasOlder && (
        <button
          type="button"
          onClick={() => void loadOlder()}
          disabled={busy}
          className={`${QUIET_BUTTON} self-center`}
        >
          Show {VERSION_PAGE_SIZE} Older Versions
        </button>
      )}
    </div>
  )
}

function VersionRow({
  version,
  isCurrent,
  isRenaming,
  busy,
  onView,
  onStartRename,
  onCancelRename,
  onRename,
  onCopyLink,
  onRevert,
}: {
  version: ScenarioVersion
  isCurrent: boolean
  isRenaming: boolean
  busy: boolean
  onView: () => void
  onStartRename: () => void
  onCancelRename: () => void
  onRename: (name: string) => void
  onCopyLink: () => void
  onRevert: () => void
}) {
  const number = version.versionNumber
  return (
    <li
      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2
        border-base-middle bg-base-end px-6 py-4"
    >
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-bold wrap-break-word text-ink">{versionLabel(version)}</h3>
          {isCurrent && (
            <span className="rounded-full border-2 border-accent-start px-3 text-sm font-bold text-ink">
              Current
            </span>
          )}
        </div>
        <p className="text-sm text-muted">
          Saved {formatSavedAt(version.createdAt)} &middot; {noteCount(version.chart)}{' '}
          {noteCount(version.chart) === 1 ? 'note' : 'notes'}
        </p>
        <p className="text-sm wrap-break-word text-faint">{describeSettings(version)}</p>
      </div>

      {isRenaming ? (
        <RenameForm version={version} busy={busy} onCancel={onCancelRename} onSubmit={onRename} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onView}
            aria-label={`View version ${number}`}
            className={QUIET_BUTTON}
          >
            View
          </button>
          <button
            type="button"
            onClick={onStartRename}
            aria-label={`Rename version ${number}`}
            className={QUIET_BUTTON}
          >
            Rename
          </button>
          <button
            type="button"
            onClick={onCopyLink}
            aria-label={`Copy link to version ${number}`}
            className={QUIET_BUTTON}
          >
            Copy Link
          </button>
          {!isCurrent && (
            <button
              type="button"
              onClick={onRevert}
              disabled={busy}
              aria-label={`Revert to version ${number}`}
              className={QUIET_BUTTON}
            >
              Revert
            </button>
          )}
        </div>
      )}
    </li>
  )
}

function RenameForm({
  version,
  busy,
  onCancel,
  onSubmit,
}: {
  version: ScenarioVersion
  busy: boolean
  onCancel: () => void
  onSubmit: (name: string) => void
}) {
  const [name, setName] = useState(version.name ?? '')

  function submit(event: FormEvent) {
    event.preventDefault()
    onSubmit(name)
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={name}
        maxLength={VERSION_NAME_MAX_LENGTH}
        autoFocus
        aria-label={`Name for version ${version.versionNumber}`}
        placeholder="Name this version"
        onChange={(event) => setName(event.target.value)}
        className="min-w-48 rounded-lg border-2 border-base-middle bg-base-start px-3 py-2 text-ink
          placeholder:text-faint focus:border-accent-start focus:outline-none"
      />
      <button type="submit" disabled={busy} className={QUIET_BUTTON}>
        Save Name
      </button>
      <button type="button" onClick={onCancel} className={QUIET_BUTTON}>
        Cancel
      </button>
    </form>
  )
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}
