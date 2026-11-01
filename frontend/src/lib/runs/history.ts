/**
 * The read path for the signed-in user's play history (user story #34).
 *
 * History comes from the backend rather than straight from Firestore: firestore.rules let any
 * signed-in user read runs, so the API is what limits it to the caller's own.
 */
import { apiFetch } from '@/lib/api'
import type { Instrument, RunValidation } from '@/lib/schema/types'

/** Mirrors backend/app/schemas.py's PlayHistoryEntry; playedAt arrives as an ISO string. */
export interface PlayHistoryEntry {
  runId: string
  scenarioId: string
  scenarioVersionId: string
  /** null once the scenario has been deleted or made private. */
  scenarioTitle: string | null
  instrument: Instrument
  finalScore: number
  playedAt: string
  validation: RunValidation
  matchId: string | null
  /** false when the scenario can no longer be opened or played. */
  scenarioAvailable: boolean
  /** false when the scenario has been updated since this run. */
  isCurrentVersion: boolean
}

export interface PlayHistoryPage {
  entries: PlayHistoryEntry[]
  /** Pass back to fetch the next page; null on the last one. */
  nextBefore: string | null
}

/** One page of the caller's runs, newest first, starting after `before` when given. */
export function fetchPlayHistory(before?: string | null): Promise<PlayHistoryPage> {
  const params = new URLSearchParams()
  if (before) params.set('before', before)
  const query = params.toString()
  return apiFetch<PlayHistoryPage>(`/history${query ? `?${query}` : ''}`)
}
