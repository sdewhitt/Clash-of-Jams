/**
 * Firestore read and write paths for scenarios the signed-in user authors.
 *
 * Versions are immutable under firestore.rules, so every save writes a new
 * scenarios/{id}/versions/{versionId} document and repoints the parent at it.
 * Both writes go in one batch: a scenario whose currentVersionId names a
 * version that was never written would be unplayable. Deleting is the mirror
 * image: the scenario and all of its versions go in one batch.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore'

import { chartDurationMs } from '@/lib/chart/notes'
import { db } from '@/lib/firebase'
import {
  COLLECTIONS,
  newScenario,
  newScenarioVersion,
  scenarioVersionsPath,
} from '@/lib/schema/collections'
import type { Scenario, ScenarioVersion } from '@/lib/schema/types'
import type { ScenarioDraft } from '@/pages/scenario_editor/draft'

export interface SaveResult {
  scenarioId: string
  versionId: string
  versionNumber: number
}

/**
 * Writes a draft as a new scenario, or as a new version of one the caller
 * already owns. Refuses without a uid, and refuses to touch someone else's
 * scenario, so a rejected write fails here rather than as a rules error.
 */
export async function saveScenarioDraft(args: {
  uid: string | null
  draft: ScenarioDraft
  scenarioId?: string | null
}): Promise<SaveResult> {
  const { uid, draft, scenarioId } = args
  if (!uid) throw new Error('Sign in before saving a scenario.')
  if (!draft.title.trim()) throw new Error('Give the scenario a title before saving.')

  const scenarioRef = scenarioId
    ? doc(db, COLLECTIONS.scenarios, scenarioId)
    : doc(collection(db, COLLECTIONS.scenarios))
  const versionRef = doc(collection(db, scenarioVersionsPath(scenarioRef.id)))

  let versionNumber = 1
  let existing: Scenario | null = null
  if (scenarioId) {
    const snapshot = await getDoc(scenarioRef)
    if (!snapshot.exists()) throw new Error('That scenario no longer exists.')
    existing = snapshot.data() as Scenario
    if (existing.authorUid !== uid) throw new Error('You can only edit your own scenarios.')
    versionNumber = existing.currentVersionNumber + 1
  }

  const batch = writeBatch(db)
  batch.set(
    versionRef,
    newScenarioVersion({
      id: versionRef.id,
      scenarioId: scenarioRef.id,
      versionNumber,
      createdByUid: uid,
      chart: draft.chart,
      durationMs: chartDurationMs(draft.chart),
    }),
  )

  if (existing) {
    batch.update(scenarioRef, {
      title: draft.title.trim(),
      description: draft.description,
      instrument: draft.instrument,
      visibility: draft.visibility,
      authorDifficulty: draft.authorDifficulty,
      currentVersionId: versionRef.id,
      currentVersionNumber: versionNumber,
      updatedAt: serverTimestamp(),
    })
  } else {
    batch.set(scenarioRef, {
      ...newScenario({
        id: scenarioRef.id,
        authorUid: uid,
        title: draft.title.trim(),
        description: draft.description,
        instrument: draft.instrument,
        visibility: draft.visibility,
        authorDifficulty: draft.authorDifficulty,
      }),
      currentVersionId: versionRef.id,
      currentVersionNumber: versionNumber,
    })
  }

  await batch.commit()
  return { scenarioId: scenarioRef.id, versionId: versionRef.id, versionNumber }
}

export interface LoadedScenario {
  scenario: Scenario
  version: ScenarioVersion | null
}

/** Reads a scenario and one of its versions: `versionId`, or the one it currently points at. */
export async function loadScenario(
  scenarioId: string,
  versionId?: string | null,
): Promise<LoadedScenario> {
  const snapshot = await getDoc(doc(db, COLLECTIONS.scenarios, scenarioId))
  if (!snapshot.exists()) throw new Error('That scenario no longer exists.')
  const scenario = snapshot.data() as Scenario

  const wanted = versionId || scenario.currentVersionId
  if (!wanted) return { scenario, version: null }

  const versionSnapshot = await getDoc(doc(db, scenarioVersionsPath(scenarioId), wanted))
  return {
    scenario,
    version: versionSnapshot.exists() ? (versionSnapshot.data() as ScenarioVersion) : null,
  }
}

/**
 * Removes a scenario the caller owns, together with every version of it.
 * Firestore does not cascade, so the versions are deleted explicitly; one
 * batch keeps a failure from leaving versions behind without their parent.
 * Runs already played against it are history and stay where they are.
 */
export async function deleteScenario(args: {
  uid: string | null
  scenarioId: string
}): Promise<void> {
  const { uid, scenarioId } = args
  if (!uid) throw new Error('Sign in before deleting a scenario.')

  const scenarioRef = doc(db, COLLECTIONS.scenarios, scenarioId)
  const snapshot = await getDoc(scenarioRef)
  // Already gone, which is what the caller wanted.
  if (!snapshot.exists()) return
  if ((snapshot.data() as Scenario).authorUid !== uid) {
    throw new Error('You can only delete your own scenarios.')
  }

  const versions = await getDocs(collection(db, scenarioVersionsPath(scenarioId)))
  const batch = writeBatch(db)
  for (const version of versions.docs) batch.delete(version.ref)
  batch.delete(scenarioRef)
  await batch.commit()
}

/** The caller's own scenarios, most recently touched first. */
export async function listMyScenarios(uid: string, limit = 50): Promise<Scenario[]> {
  const snapshot = await getDocs(
    query(
      collection(db, COLLECTIONS.scenarios),
      where('authorUid', '==', uid),
      orderBy('updatedAt', 'desc'),
      limitTo(limit),
    ),
  )
  return snapshot.docs.map((entry) => entry.data() as Scenario)
}
