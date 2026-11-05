/**
 * Firestore read and write paths for scenarios the signed-in user authors.
 *
 * Versions are immutable under firestore.rules, so every save writes a new
 * scenarios/{id}/versions/{versionId} document and repoints the parent at it.
 * Both writes commit together: a scenario whose currentVersionId names a
 * version that was never written would be unplayable. Deleting is the mirror
 * image: the scenario and all of its versions go in one batch. Reverting keeps
 * history linear by deleting every version after the one reverted to.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

import { chartDurationMs } from '@/lib/chart/notes'
import { db } from '@/lib/firebase'
import {
  COLLECTIONS,
  VERSION_NAME_MAX_LENGTH,
  newScenario,
  newScenarioVersion,
  scenarioVersionsPath,
} from '@/lib/schema/collections'
import type { Scenario, ScenarioVersion, ScenarioVersionMetadata } from '@/lib/schema/types'
import { draftContentEqual, draftFromDocuments } from '@/pages/scenario_editor/draft'
import type { ScenarioDraft } from '@/pages/scenario_editor/draft'

export interface SaveResult {
  scenarioId: string
  versionId: string
  versionNumber: number
  /** A new version, a visibility change on the parent alone, or nothing at all. */
  outcome: 'version' | 'visibility' | 'unchanged'
}

/**
 * Writes a draft as a new scenario, or as a new version of one the caller owns.
 *
 * Saving an existing scenario is a transaction, which is what keeps version
 * numbers unique. Content matching the current version writes no version, so a
 * retry of a save that already landed returns that version. That check comes
 * before the conflict check: two tabs saving the same thing do not conflict.
 * `baseVersionId` is the version the draft was started from; if the scenario has
 * moved on from it, the save throws ScenarioConflictError and changes nothing.
 */
export async function saveScenarioDraft(args: {
  uid: string | null
  draft: ScenarioDraft
  scenarioId?: string | null
  baseVersionId?: string | null
}): Promise<SaveResult> {
  const { uid, draft, scenarioId, baseVersionId } = args
  if (!uid) throw new Error('Sign in before saving a scenario.')
  if (!draft.title.trim()) throw new Error('Give the scenario a title before saving.')

  if (scenarioId) return saveNewVersion(uid, draft, scenarioId, baseVersionId)

  const scenarioRef = doc(collection(db, COLLECTIONS.scenarios))
  const versionRef = doc(collection(db, scenarioVersionsPath(scenarioRef.id)))
  const batch = writeBatch(db)
  batch.set(
    versionRef,
    newScenarioVersion({
      id: versionRef.id,
      scenarioId: scenarioRef.id,
      versionNumber: 1,
      createdByUid: uid,
      chart: draft.chart,
      durationMs: chartDurationMs(draft.chart),
      metadata: versionMetadata(draft, [], []),
    }),
  )
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
    currentVersionNumber: 1,
  })
  await batch.commit()
  return {
    scenarioId: scenarioRef.id,
    versionId: versionRef.id,
    versionNumber: 1,
    outcome: 'version',
  }
}

function saveNewVersion(
  uid: string,
  draft: ScenarioDraft,
  scenarioId: string,
  baseVersionId: string | null | undefined,
): Promise<SaveResult> {
  const scenarioRef = doc(db, COLLECTIONS.scenarios, scenarioId)
  const versions = scenarioVersionsPath(scenarioId)
  // Made once, so a transaction retry writes the same document.
  const versionRef = doc(collection(db, versions))

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(scenarioRef)
    if (!snapshot.exists()) throw new Error('That scenario no longer exists.')
    const existing = snapshot.data() as Scenario
    if (existing.authorUid !== uid) throw new Error('You can only edit your own scenarios.')

    const currentSnapshot = existing.currentVersionId
      ? await transaction.get(doc(db, versions, existing.currentVersionId))
      : null
    const current = currentSnapshot?.exists() ? (currentSnapshot.data() as ScenarioVersion) : null

    if (current && draftContentEqual(draft, draftFromDocuments(existing, current))) {
      const moved = draft.visibility !== existing.visibility
      if (moved) {
        transaction.update(scenarioRef, {
          visibility: draft.visibility,
          updatedAt: serverTimestamp(),
        })
      }
      return {
        scenarioId,
        versionId: current.id,
        versionNumber: current.versionNumber,
        outcome: moved ? ('visibility' as const) : ('unchanged' as const),
      }
    }

    if (baseVersionId !== undefined && baseVersionId !== existing.currentVersionId) {
      throw new ScenarioConflictError()
    }

    const versionNumber = existing.currentVersionNumber + 1
    transaction.set(
      versionRef,
      newScenarioVersion({
        id: versionRef.id,
        scenarioId,
        versionNumber,
        createdByUid: uid,
        chart: draft.chart,
        durationMs: chartDurationMs(draft.chart),
        // Only the chart and settings are editable, so the rest carries forward.
        scoringRules: current?.scoringRules,
        mediaAssetIds: current?.mediaAssetIds,
        metadata: versionMetadata(draft, existing.genres, existing.tags),
      }),
    )
    transaction.update(scenarioRef, {
      title: draft.title.trim(),
      description: draft.description,
      instrument: draft.instrument,
      visibility: draft.visibility,
      authorDifficulty: draft.authorDifficulty,
      currentVersionId: versionRef.id,
      currentVersionNumber: versionNumber,
      updatedAt: serverTimestamp(),
    })
    return {
      scenarioId,
      versionId: versionRef.id,
      versionNumber,
      outcome: 'version' as const,
    }
  })
}

function versionMetadata(
  draft: ScenarioDraft,
  genres: Scenario['genres'],
  tags: string[],
): ScenarioVersionMetadata {
  return {
    title: draft.title.trim(),
    description: draft.description,
    instrument: draft.instrument,
    authorDifficulty: draft.authorDifficulty,
    genres,
    tags,
  }
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

/** How many versions one page of the history shows. */
export const VERSION_PAGE_SIZE = 20

/** A page of a scenario's versions, newest first, older than `beforeNumber` if given. */
export async function listScenarioVersions(
  scenarioId: string,
  beforeNumber?: number,
): Promise<ScenarioVersion[]> {
  const versions = collection(db, scenarioVersionsPath(scenarioId))
  const snapshot = await getDocs(
    query(
      versions,
      ...(beforeNumber === undefined ? [] : [where('versionNumber', '<', beforeNumber)]),
      orderBy('versionNumber', 'desc'),
      limitTo(VERSION_PAGE_SIZE),
    ),
  )
  return snapshot.docs.map((entry) => entry.data() as ScenarioVersion)
}

/** Names a version, or clears its name when given only whitespace. Returns what was stored. */
export async function renameScenarioVersion(args: {
  scenarioId: string
  versionId: string
  name: string
}): Promise<string | null> {
  const name = args.name.trim().slice(0, VERSION_NAME_MAX_LENGTH) || null
  await updateDoc(doc(db, scenarioVersionsPath(args.scenarioId), args.versionId), { name })
  return name
}

/** The scenario moved on from what the caller was looking at, e.g. in another tab. */
export class ScenarioConflictError extends Error {
  constructor() {
    super('This scenario changed somewhere else. Check the latest versions and try again.')
    this.name = 'ScenarioConflictError'
  }
}

/**
 * Makes an earlier version the current one and permanently deletes every version
 * after it. Its recorded settings return to the scenario; visibility stays as it
 * is, so reverting can never republish something since made private.
 *
 * Client transactions cannot run queries, so the later versions are listed first.
 * That list cannot go stale unnoticed: every save rewrites the parent, so checking
 * currentVersionId inside the transaction also checks the list.
 */
export async function revertToVersion(args: {
  uid: string | null
  scenarioId: string
  targetVersionId: string
  expectedCurrentVersionId: string | null
}): Promise<{ versionNumber: number; deletedCount: number }> {
  const { uid, scenarioId, targetVersionId, expectedCurrentVersionId } = args
  if (!uid) throw new Error('Sign in before reverting a scenario.')

  const scenarioRef = doc(db, COLLECTIONS.scenarios, scenarioId)
  const targetRef = doc(db, scenarioVersionsPath(scenarioId), targetVersionId)
  const targetSnapshot = await getDoc(targetRef)
  if (!targetSnapshot.exists()) throw new Error('That version is no longer available.')
  const { versionNumber } = targetSnapshot.data() as ScenarioVersion

  const later = await getDocs(
    query(
      collection(db, scenarioVersionsPath(scenarioId)),
      where('versionNumber', '>', versionNumber),
    ),
  )

  await runTransaction(db, async (transaction) => {
    const scenarioSnapshot = await transaction.get(scenarioRef)
    if (!scenarioSnapshot.exists()) throw new Error('That scenario no longer exists.')
    const scenario = scenarioSnapshot.data() as Scenario
    if (scenario.authorUid !== uid) throw new Error('You can only revert your own scenarios.')
    if (scenario.currentVersionId !== expectedCurrentVersionId) throw new ScenarioConflictError()

    const target = await transaction.get(targetRef)
    if (!target.exists()) throw new ScenarioConflictError()

    for (const version of later.docs) transaction.delete(version.ref)
    transaction.update(scenarioRef, {
      ...(target.data() as ScenarioVersion).metadata,
      currentVersionId: targetVersionId,
      currentVersionNumber: versionNumber,
      updatedAt: serverTimestamp(),
    })
  })

  return { versionNumber, deletedCount: later.size }
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
