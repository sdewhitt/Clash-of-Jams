/**
 * The editor's "Your Library" tab: the scenarios the caller has authored.
 *
 * RequireAuth already keeps signed-out visitors off this route, but the panel
 * checks for itself: scenarios are queried by author, so without a uid there is
 * no query to run and a sign-in prompt is the honest thing to show.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { useAuth } from '@/lib/auth/useAuth'
import { deleteScenario, listMyScenarios } from '@/lib/scenarios/store'
import type { Scenario } from '@/lib/schema/types'
import { INSTRUMENT_LABELS } from '@/pages/scenario_editor/draft'
import { EmptyState } from '@/pages/scenario_editor/EmptyState'

interface YourLibraryPanelProps {
  /** Opens a saved scenario in the editor tab. */
  onOpenScenario: (scenarioId: string) => void
  /** Sends the author to the blank-scenario tab. */
  onCreateNew: () => void
  /** Called once a scenario is gone, so the editor can let go of it too. */
  onScenarioDeleted?: (scenarioId: string) => void
}

export function YourLibraryPanel({
  onOpenScenario,
  onCreateNew,
  onScenarioDeleted,
}: YourLibraryPanelProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const [scenarios, setScenarios] = useState<Scenario[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) return

    let cancelled = false
    listMyScenarios(uid)
      .then((found) => {
        if (!cancelled) setScenarios(found)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load your scenarios.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  async function handleDelete(scenario: Scenario) {
    const question = `Delete "${scenario.title}" and all of its versions? This cannot be undone.`
    if (!window.confirm(question)) return

    setDeletingId(scenario.id)
    setDeleteError(null)
    try {
      await deleteScenario({ uid, scenarioId: scenario.id })
      setScenarios((current) => current?.filter((entry) => entry.id !== scenario.id) ?? null)
      onScenarioDeleted?.(scenario.id)
    } catch (cause: unknown) {
      setDeleteError(cause instanceof Error ? cause.message : 'Could not delete that scenario.')
    } finally {
      setDeletingId(null)
    }
  }

  if (!uid) {
    return (
      <EmptyState
        title="Sign in to see your library"
        action={{ label: 'Sign In', onClick: () => navigate('/login') }}
      >
        Your scenarios are saved to your account, so your library is only available once you are
        signed in.
      </EmptyState>
    )
  }

  if (error) {
    return <EmptyState title="Could not load your library">{error}</EmptyState>
  }

  if (scenarios === null) {
    return <p className="py-12 text-center text-muted">Loading your scenarios...</p>
  }

  if (scenarios.length === 0) {
    return (
      <EmptyState
        title="Your library is empty"
        action={{ label: 'Start a New Scenario', onClick: onCreateNew }}
      >
        Scenarios you create will collect here, each one openable for another pass in the editor.
      </EmptyState>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {deleteError && (
        <li role="alert" className="text-sm font-bold text-accent-end">
          {deleteError}
        </li>
      )}
      {scenarios.map((scenario) => (
        <li
          key={scenario.id}
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2
            border-base-middle bg-base-end px-6 py-4"
        >
          <div>
            <h3 className="text-xl font-bold text-ink">{scenario.title}</h3>
            <p className="text-sm text-muted">
              {INSTRUMENT_LABELS[scenario.instrument]} &middot; {scenario.visibility} &middot;
              version {scenario.currentVersionNumber} &middot; difficulty{' '}
              {scenario.authorDifficulty}/10
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onOpenScenario(scenario.id)}
              className="rounded-lg bg-linear-to-b from-contrast-start from-50 via-contrast-middle
                to-contrast-end to-70 px-5 py-2 font-bold text-ink outline-3
                outline-contrast-middle transition-all hover:brightness-125 active:scale-95"
            >
              Open in Editor
            </button>
            <button
              type="button"
              onClick={() => void handleDelete(scenario)}
              disabled={deletingId !== null}
              aria-label={`Delete ${scenario.title}`}
              aria-busy={deletingId === scenario.id}
              title="Delete scenario"
              className="rounded-lg border-2 border-base-middle p-2 text-ink transition-colors
                hover:border-accent-end hover:bg-accent-base-middle disabled:cursor-not-allowed
                disabled:text-faint disabled:hover:border-base-middle
                disabled:hover:bg-transparent"
            >
              <TrashIcon />
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-6"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}
