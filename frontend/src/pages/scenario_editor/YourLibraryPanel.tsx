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
import { listMyScenarios } from '@/lib/scenarios/store'
import type { Scenario } from '@/lib/schema/types'
import { INSTRUMENT_LABELS } from '@/pages/scenario_editor/draft'
import { EmptyState } from '@/pages/scenario_editor/EmptyState'

interface YourLibraryPanelProps {
  /** Opens a saved scenario in the editor tab. */
  onOpenScenario: (scenarioId: string) => void
  /** Sends the author to the blank-scenario tab. */
  onCreateNew: () => void
}

export function YourLibraryPanel({ onOpenScenario, onCreateNew }: YourLibraryPanelProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const uid = user?.uid ?? null

  const [scenarios, setScenarios] = useState<Scenario[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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
          <button
            type="button"
            onClick={() => onOpenScenario(scenario.id)}
            className="rounded-lg bg-linear-to-b from-contrast-start from-50 via-contrast-middle
              to-contrast-end to-70 px-5 py-2 font-bold text-ink outline-3
              outline-contrast-middle transition-all hover:brightness-125 active:scale-95"
          >
            Open in Editor
          </button>
        </li>
      ))}
    </ul>
  )
}
