/**
 * The write path for a finished run.
 *
 * A run is written to runs/{runId} as 'pending', the only state firestore.rules let a client
 * create, and then handed to the backend, which checks it against the scenario version and
 * marks it accepted or rejected. Only accepted runs reach a leaderboard.
 */
import { collection, doc, setDoc } from 'firebase/firestore'

import { apiFetch } from '@/lib/api'
import { db } from '@/lib/firebase'
import { COLLECTIONS, newRun } from '@/lib/schema/collections'
import type { Instrument, RunValidation, ScoreBreakdown, ScoringRules } from '@/lib/schema/types'

export interface SubmittedRun {
  runId: string
  /** 'pending' when the run was saved but the backend could not be reached to check it. */
  validation: RunValidation
  /** Why the backend rejected the run, when it did. */
  reason: string | null
}

export async function submitRun(args: {
  uid: string | null
  scenarioId: string
  scenarioVersionId: string
  instrument: Instrument
  partId: string
  speedMultiplier: number
  scoringRules: ScoringRules
  finalScore: number
  breakdown: ScoreBreakdown
}): Promise<SubmittedRun> {
  const { uid, ...run } = args
  if (!uid) throw new Error('Sign in before saving a run.')

  const ref = doc(collection(db, COLLECTIONS.runs))
  await setDoc(ref, newRun({ id: ref.id, userUid: uid, ...run }))

  try {
    const result = await apiFetch<{ validation: RunValidation; reason: string | null }>(
      `/runs/${ref.id}/validate`,
      { method: 'POST' },
    )
    return { runId: ref.id, validation: result.validation, reason: result.reason ?? null }
  } catch (error) {
    // The run itself is saved; it stays pending until something validates it.
    console.error(error)
    return { runId: ref.id, validation: 'pending', reason: null }
  }
}
