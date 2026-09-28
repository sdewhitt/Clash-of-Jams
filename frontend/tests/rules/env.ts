/**
 * Shared harness for the Firestore security-rule tests.
 *
 * Each file gets a RulesTestEnvironment loaded with firebase/firestore.rules
 * and pointed at the emulator. `npm run test:rules` starts the emulator for the
 * run; with one already running on 127.0.0.1:8080, `npx vitest run --project
 * rules` works too.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc, type DocumentData, type Firestore } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach } from 'vitest'

import {
  COLLECTIONS,
  emptyChart,
  newRun,
  newScenario,
  newScenarioVersion,
  newUserProfile,
  newUserSettings,
  scenarioVersionsPath,
} from '../../src/lib/schema/collections.ts'
import type { ExpectedNote, Run } from '../../src/lib/schema/types.ts'

export { assertFails, assertSucceeds }

const RULES_PATH = resolve(import.meta.dirname, '../../../firebase/firestore.rules')

/** Registers the environment for the calling file and wipes data between tests. */
export function setupRulesEnv(): () => RulesTestEnvironment {
  let env: RulesTestEnvironment

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-clash-of-jams',
      firestore: {
        rules: readFileSync(RULES_PATH, 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    })
  })

  beforeEach(async () => {
    await env.clearFirestore()
  })

  afterAll(async () => {
    await env?.cleanup()
  })

  return () => env
}

export function as(env: RulesTestEnvironment, uid: string | null): Firestore {
  const context = uid === null ? env.unauthenticatedContext() : env.authenticatedContext(uid)
  return context.firestore() as unknown as Firestore
}

/** Writes documents with the rules switched off, for setting up server-owned state. */
export async function seed(env: RulesTestEnvironment, writes: Array<[path: string, data: object]>) {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore() as unknown as Firestore
    for (const [path, data] of writes) await setDoc(doc(db, path), data as DocumentData)
  })
}

/* ------------------------------------------------------------ fixtures */

export const ALICE = 'alice-uid'
export const BOB = 'bob-uid'

export const aliceProfile = (overrides: Record<string, unknown> = {}) => ({
  ...newUserProfile({ uid: ALICE, username: 'Alice' }),
  ...overrides,
})

export const aliceSettings = () => newUserSettings({ uid: ALICE })

export const scenarioDoc = (
  id: string,
  authorUid = ALICE,
  overrides: Record<string, unknown> = {},
) => ({
  ...newScenario({ id, authorUid, title: 'C major scale', instrument: 'piano' }),
  ...overrides,
})

const SCALE: ExpectedNote[] = [60, 62, 64, 65, 67, 69, 71, 72].map((midiPitch, index) => ({
  index,
  midiPitch,
  startBeat: index,
  durationBeats: 1,
  velocity: 80,
}))

export const scaleChart = () => {
  const chart = emptyChart('piano')
  chart.parts[0].notes = SCALE
  return chart
}

export const versionDoc = (scenarioId: string, id: string, createdByUid = ALICE) =>
  newScenarioVersion({
    id,
    scenarioId,
    versionNumber: 1,
    createdByUid,
    chart: scaleChart(),
    durationMs: 4000,
  })

export const versionPath = (scenarioId: string, versionId: string) =>
  `${scenarioVersionsPath(scenarioId)}/${versionId}`

export const BREAKDOWN: Run['breakdown'] = {
  pitchAccuracy: 0.9,
  rhythmAccuracy: 0.85,
  completeness: 1,
  notesHit: 7,
  notesMissed: 1,
  extraNotes: 0,
  noteResults: [{ expectedNoteIndex: 0, verdict: 'hit', timingDeltaMs: 12, centsDeviation: -4 }],
}

export const runDoc = (
  id: string,
  args: { userUid?: string; finalScore?: number; validation?: Run['validation']; version?: string },
) =>
  newRun({
    id,
    userUid: args.userUid ?? ALICE,
    scenarioId: 'scale',
    scenarioVersionId: args.version ?? 'scale-v1',
    instrument: 'piano',
    partId: 'lead',
    finalScore: args.finalScore ?? 900,
    breakdown: BREAKDOWN,
    validation: args.validation,
  })

export const path = {
  user: (uid: string) => `${COLLECTIONS.users}/${uid}`,
  settings: (uid: string) => `${COLLECTIONS.userSettings}/${uid}`,
  scenario: (id: string) => `${COLLECTIONS.scenarios}/${id}`,
  run: (id: string) => `${COLLECTIONS.runs}/${id}`,
}

/** Drops one key, for "missing required field" cases. */
export function without<T extends object>(data: T, key: keyof T): Omit<T, typeof key> {
  const copy = { ...data }
  delete copy[key]
  return copy
}
