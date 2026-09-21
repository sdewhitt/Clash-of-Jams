/**
 * Initializes Firestore with the Clash of Jams schema (user story #74).
 *
 * Firestore has no DDL — a collection exists once it holds a document — so
 * "initializing" here means writing one fully-populated template document to
 * every collection and subcollection in the design document, then reading each
 * one back to prove every field round-trips unchanged.
 *
 * Usage (from the frontend/ directory):
 *   npm run db:init              write the template documents
 *   npm run db:init -- --dry-run print what would be written, touch nothing
 *   npm run db:init -- --verify  read back and check without writing
 *   npm run db:init -- --purge   delete the template documents again
 *   npm run db:init -- --emulator  target 127.0.0.1:8080 instead of the cloud
 *
 * Auth: set FIREBASE_SEED_EMAIL / FIREBASE_SEED_PASSWORD to sign in first, or
 * pass --anonymous. With neither, the script writes unauthenticated, which
 * only works while the database is in test mode.
 */
import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, signInWithEmailAndPassword, type Auth } from 'firebase/auth'
import {
  FieldValue,
  Timestamp,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'

import {
  COLLECTIONS,
  SCHEMA_META_PATH,
  SCHEMA_VERSION,
  chartWithPart,
  communityMembersPath,
  friendshipId,
  matchParticipantsPath,
  newCommunity,
  newCommunityMembership,
  newFriendship,
  newImportJob,
  newMatch,
  newMatchInvitation,
  newMatchParticipant,
  newMediaAsset,
  newModerationAction,
  newPlaylist,
  newPlaylistItem,
  newRecordingShare,
  newRun,
  newScenario,
  newScenarioReview,
  newScenarioVersion,
  newSkillRating,
  newUserProfile,
  newUserReport,
  newUserSettings,
  newUsernameReservation,
  playlistItemsPath,
  scenarioReviewId,
  scenarioVersionsPath,
  skillRatingsPath,
  usernameKey,
} from '../src/lib/schema/collections.ts'
import type { ScoreBreakdown } from '../src/lib/schema/types.ts'
import { loadEnvFiles, readFirebaseConfig } from './firebase-config.ts'

/* ----------------------------------------------------------------- args */

const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')
const VERIFY_ONLY = args.has('--verify')
const PURGE = args.has('--purge')
const USE_EMULATOR = args.has('--emulator')
const ANONYMOUS = args.has('--anonymous')

/* ------------------------------------------------------- template data */

/**
 * Template documents use a fixed `seed_` prefix so the script is idempotent —
 * re-running overwrites the same documents rather than piling up new ones —
 * and so --purge can find exactly what it wrote.
 */
const PREFIX = 'seed_'
const UID_A = `${PREFIX}user_a`
const UID_B = `${PREFIX}user_b`
const SCENARIO_ID = `${PREFIX}scenario`
const VERSION_ID = `${PREFIX}scenario_v1`
const MEDIA_ID = `${PREFIX}media`
const RUN_ID = `${PREFIX}run`
const MATCH_ID = `${PREFIX}match`
const COMMUNITY_ID = `${PREFIX}community`
const PLAYLIST_ID = `${PREFIX}playlist`
const PLAYLIST_ITEM_ID = `${PREFIX}playlist_item`
const REPORT_ID = `${PREFIX}report`
const ACTION_ID = `${PREFIX}moderation_action`
const INVITATION_ID = `${PREFIX}invitation`
const SHARE_ID = `${PREFIX}recording_share`
const IMPORT_ID = `${PREFIX}import_job`

/** A one-bar C major scale so the chart shape is exercised, not just empty. */
const SEED_CHART = chartWithPart({
  partId: 'lead',
  name: 'Lead',
  instrument: 'piano',
  notes: [60, 62, 64, 65, 67, 69, 71, 72].map((midiPitch, index) => ({
    index,
    midiPitch,
    startBeat: index * 0.5,
    durationBeats: 0.5,
    velocity: 80,
  })),
})

const SEED_BREAKDOWN: ScoreBreakdown = {
  pitchAccuracy: 0.94,
  rhythmAccuracy: 0.88,
  completeness: 1,
  notesHit: 8,
  notesMissed: 0,
  extraNotes: 1,
  noteResults: [
    { expectedNoteIndex: 0, verdict: 'hit', timingDeltaMs: -12, centsDeviation: 4 },
    { expectedNoteIndex: 1, verdict: 'late', timingDeltaMs: 63, centsDeviation: -9 },
  ],
}

interface Plan {
  /** Full document path, e.g. "scenarios/seed_scenario/versions/seed_scenario_v1". */
  path: string
  /** Which design-document entity this document is a template for. */
  entity: string
  data: DocumentData
}

/**
 * Fixed rather than "now + 24h" so a standalone --verify compares against the
 * same value the write produced.
 */
const SEED_INVITATION_EXPIRY = Timestamp.fromDate(new Date('2030-01-01T00:00:00.000Z'))

function buildPlan(): Plan[] {
  return [
    {
      path: `${COLLECTIONS.users}/${UID_A}`,
      entity: 'UserProfile',
      data: newUserProfile({ uid: UID_A, username: 'SeedPlayerA', displayName: 'Seed Player A' }),
    },
    {
      path: `${COLLECTIONS.users}/${UID_B}`,
      entity: 'UserProfile',
      data: newUserProfile({ uid: UID_B, username: 'SeedPlayerB', displayName: 'Seed Player B' }),
    },
    {
      path: `${COLLECTIONS.usernames}/${usernameKey('SeedPlayerA')}`,
      entity: 'UsernameReservation',
      data: newUsernameReservation({ uid: UID_A, username: 'SeedPlayerA' }),
    },
    {
      path: `${COLLECTIONS.usernames}/${usernameKey('SeedPlayerB')}`,
      entity: 'UsernameReservation',
      data: newUsernameReservation({ uid: UID_B, username: 'SeedPlayerB' }),
    },
    {
      path: `${COLLECTIONS.userSettings}/${UID_A}`,
      entity: 'UserSettings',
      data: newUserSettings({ uid: UID_A, preferredInstrument: 'piano' }),
    },
    {
      path: `${skillRatingsPath(UID_A)}/piano`,
      entity: 'SkillRating',
      data: newSkillRating({ uid: UID_A, instrument: 'piano' }),
    },
    {
      path: `${COLLECTIONS.scenarios}/${SCENARIO_ID}`,
      entity: 'Scenario',
      data: {
        ...newScenario({
          id: SCENARIO_ID,
          authorUid: UID_A,
          title: 'Seed Scenario — C Major Scale',
          instrument: 'piano',
          description: 'Template scenario written by scripts/init-firestore.ts.',
          visibility: 'public',
          tags: ['seed', 'scale', 'beginner'],
          authorDifficulty: 2,
        }),
        currentVersionId: VERSION_ID,
        currentVersionNumber: 1,
      },
    },
    {
      path: `${scenarioVersionsPath(SCENARIO_ID)}/${VERSION_ID}`,
      entity: 'ScenarioVersion',
      data: newScenarioVersion({
        id: VERSION_ID,
        scenarioId: SCENARIO_ID,
        versionNumber: 1,
        createdByUid: UID_A,
        chart: SEED_CHART,
        durationMs: 4000,
        mediaAssetIds: [MEDIA_ID],
      }),
    },
    {
      path: `${COLLECTIONS.mediaAssets}/${MEDIA_ID}`,
      entity: 'MediaAsset',
      data: newMediaAsset({
        id: MEDIA_ID,
        ownerUid: UID_A,
        kind: 'audio',
        storagePath: `media/${UID_A}/${MEDIA_ID}.wav`,
        contentType: 'audio/wav',
        byteSize: 0,
        durationMs: 4000,
      }),
    },
    {
      path: `${COLLECTIONS.runs}/${RUN_ID}`,
      entity: 'Run',
      data: {
        ...newRun({
          id: RUN_ID,
          userUid: UID_A,
          scenarioId: SCENARIO_ID,
          scenarioVersionId: VERSION_ID,
          instrument: 'piano',
          partId: 'lead',
          finalScore: 91_200,
          breakdown: SEED_BREAKDOWN,
          matchId: MATCH_ID,
          matchParticipantUid: UID_A,
        }),
        // Accepted, so it is visible to the derived leaderboard query.
        validation: 'accepted',
      },
    },
    {
      path: `${COLLECTIONS.matches}/${MATCH_ID}`,
      entity: 'GameMatch',
      data: newMatch({
        id: MATCH_ID,
        mode: 'versus_1v1',
        scenarioId: SCENARIO_ID,
        scenarioVersionId: VERSION_ID,
        hostUid: UID_A,
        participantUids: [UID_A, UID_B],
      }),
    },
    {
      path: `${matchParticipantsPath(MATCH_ID)}/${UID_A}`,
      entity: 'MatchParticipant',
      data: newMatchParticipant({ uid: UID_A, matchId: MATCH_ID, partId: 'lead', team: 'red' }),
    },
    {
      path: `${matchParticipantsPath(MATCH_ID)}/${UID_B}`,
      entity: 'MatchParticipant',
      data: newMatchParticipant({ uid: UID_B, matchId: MATCH_ID, partId: 'lead', team: 'blue' }),
    },
    {
      path: `${COLLECTIONS.friendships}/${friendshipId(UID_A, UID_B)}`,
      entity: 'Friendship',
      data: newFriendship({
        uidOne: UID_A,
        uidTwo: UID_B,
        requestedByUid: UID_A,
        state: 'accepted',
      }),
    },
    {
      path: `${COLLECTIONS.communities}/${COMMUNITY_ID}`,
      entity: 'Community',
      data: newCommunity({
        id: COMMUNITY_ID,
        name: 'Seed Community',
        ownerUid: UID_A,
        description: 'Template community written by scripts/init-firestore.ts.',
      }),
    },
    {
      path: `${communityMembersPath(COMMUNITY_ID)}/${UID_A}`,
      entity: 'CommunityMembership',
      data: newCommunityMembership({ uid: UID_A, communityId: COMMUNITY_ID, role: 'owner' }),
    },
    {
      path: `${COLLECTIONS.playlists}/${PLAYLIST_ID}`,
      entity: 'Playlist',
      data: {
        ...newPlaylist({ id: PLAYLIST_ID, ownerUid: UID_A, name: 'Seed Playlist' }),
        itemCount: 1,
      },
    },
    {
      path: `${playlistItemsPath(PLAYLIST_ID)}/${PLAYLIST_ITEM_ID}`,
      entity: 'PlaylistItem',
      data: newPlaylistItem({
        id: PLAYLIST_ITEM_ID,
        playlistId: PLAYLIST_ID,
        scenarioId: SCENARIO_ID,
        position: 0,
      }),
    },
    {
      path: `${COLLECTIONS.scenarioReviews}/${scenarioReviewId(SCENARIO_ID, UID_B)}`,
      entity: 'ScenarioReview',
      data: newScenarioReview({
        scenarioId: SCENARIO_ID,
        reviewerUid: UID_B,
        rating: 4,
        comment: 'Template review written by scripts/init-firestore.ts.',
      }),
    },
    {
      path: `${COLLECTIONS.userReports}/${REPORT_ID}`,
      entity: 'UserReport',
      data: newUserReport({
        id: REPORT_ID,
        reporterUid: UID_B,
        targetType: 'scenario',
        targetId: SCENARIO_ID,
        reason: 'other',
        description: 'Template report written by scripts/init-firestore.ts.',
      }),
    },
    {
      path: `${COLLECTIONS.moderationActions}/${ACTION_ID}`,
      entity: 'ModerationAction',
      data: newModerationAction({
        id: ACTION_ID,
        moderatorUid: UID_A,
        reportId: REPORT_ID,
        targetType: 'scenario',
        targetId: SCENARIO_ID,
        action: 'dismiss',
        notes: 'Template moderation action written by scripts/init-firestore.ts.',
      }),
    },
    {
      path: `${COLLECTIONS.matchInvitations}/${INVITATION_ID}`,
      entity: 'MatchInvitation',
      data: newMatchInvitation({
        id: INVITATION_ID,
        matchId: MATCH_ID,
        fromUid: UID_A,
        toUid: UID_B,
        expiresAt: SEED_INVITATION_EXPIRY,
      }),
    },
    {
      path: `${COLLECTIONS.recordingShares}/${SHARE_ID}`,
      entity: 'RecordingShare',
      data: newRecordingShare({
        id: SHARE_ID,
        ownerUid: UID_A,
        runId: RUN_ID,
        scenarioId: SCENARIO_ID,
        mediaAssetId: MEDIA_ID,
        caption: 'Template recording share written by scripts/init-firestore.ts.',
        visibility: 'public',
      }),
    },
    {
      path: `${COLLECTIONS.importJobs}/${IMPORT_ID}`,
      entity: 'ImportJob',
      data: newImportJob({
        id: IMPORT_ID,
        ownerUid: UID_A,
        source: 'midi',
        sourceAssetId: MEDIA_ID,
      }),
    },
  ]
}

/* ----------------------------------------------------------- utilities */

/** Deep equality for the JSON-ish values Firestore stores. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a instanceof Timestamp && b instanceof Timestamp) return a.isEqual(b)
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))
  }
  if (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null) {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) return false
    return aKeys.every((key) => deepEqual((a as DocumentData)[key], (b as DocumentData)[key]))
  }
  return false
}

/**
 * Compares what we wrote against what came back.
 *
 * serverTimestamp() sentinels are resolved by the server, so those fields are
 * checked for presence and type rather than value.
 */
function diffFields(written: DocumentData, stored: DocumentData) {
  const problems: string[] = []
  for (const [key, expected] of Object.entries(written)) {
    const actual = stored[key]
    if (expected instanceof FieldValue) {
      if (!(actual instanceof Timestamp)) {
        problems.push(`${key}: expected a resolved server timestamp, got ${describe(actual)}`)
      }
      continue
    }
    if (!deepEqual(expected, actual)) {
      problems.push(`${key}: wrote ${describe(expected)}, read back ${describe(actual)}`)
    }
  }
  for (const key of Object.keys(stored)) {
    if (!(key in written)) problems.push(`${key}: present in Firestore but not in the schema`)
  }
  return problems
}

function describe(value: unknown) {
  if (value instanceof Timestamp) return `Timestamp(${value.toDate().toISOString()})`
  if (value === undefined) return 'undefined'
  const json = JSON.stringify(value)
  return json !== undefined && json.length > 80 ? `${json.slice(0, 77)}...` : String(json)
}

/** Firestore caps a batch at 500 operations. */
function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

/* ---------------------------------------------------------------- main */

async function signIn(auth: Auth) {
  const email = process.env.FIREBASE_SEED_EMAIL
  const password = process.env.FIREBASE_SEED_PASSWORD

  if (email && password) {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    console.log(`Signed in as ${credential.user.email} (${credential.user.uid})`)
    return
  }
  if (ANONYMOUS) {
    const credential = await signInAnonymously(auth)
    console.log(`Signed in anonymously (${credential.user.uid})`)
    return
  }
  console.log(
    'Running unauthenticated — this only works while security rules allow it (test mode).',
  )
}

async function write(db: Firestore, plan: Plan[]) {
  for (const group of chunk(plan, 500)) {
    const batch = writeBatch(db)
    for (const entry of group) batch.set(doc(db, entry.path), entry.data)
    await batch.commit()
  }

  const meta = writeBatch(db)
  meta.set(doc(db, SCHEMA_META_PATH), {
    schemaVersion: SCHEMA_VERSION,
    collections: Object.values(COLLECTIONS),
    initializedAt: Timestamp.now(),
    initializedBy: process.env.USER ?? process.env.USERNAME ?? 'unknown',
  })
  await meta.commit()

  console.log(`Wrote ${plan.length} template documents + ${SCHEMA_META_PATH}`)
}

async function verify(db: Firestore, plan: Plan[]) {
  let failures = 0
  for (const entry of plan) {
    const snapshot = await getDoc(doc(db, entry.path))
    if (!snapshot.exists()) {
      console.error(`  MISSING  ${entry.path}`)
      failures += 1
      continue
    }
    const problems = diffFields(entry.data, snapshot.data())
    if (problems.length > 0) {
      failures += 1
      console.error(`  MISMATCH ${entry.path} (${entry.entity})`)
      for (const problem of problems) console.error(`             ${problem}`)
      continue
    }
    console.log(`  ok       ${entry.path} (${entry.entity})`)
  }
  return failures
}

async function purge(db: Firestore, plan: Plan[]) {
  for (const entry of plan) await deleteDoc(doc(db, entry.path))
  await deleteDoc(doc(db, SCHEMA_META_PATH))
  console.log(`Deleted ${plan.length + 1} documents`)
}

async function main() {
  const loaded = loadEnvFiles()
  const config = readFirebaseConfig()
  const plan = buildPlan()

  console.log(
    `Project: ${config.projectId}${loaded.length > 0 ? `  (env: ${loaded.join(', ')})` : ''}`,
  )

  if (DRY_RUN) {
    console.log(`\nWould write ${plan.length} documents:`)
    for (const entry of plan) console.log(`  ${entry.path}  (${entry.entity})`)
    console.log(`  ${SCHEMA_META_PATH}  (SchemaMeta)`)
    return
  }

  const app = initializeApp(config)
  const db = getFirestore(app)
  if (USE_EMULATOR) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
    console.log('Using the Firestore emulator at 127.0.0.1:8080')
  }
  await signIn(getAuth(app))

  if (PURGE) {
    await purge(db, plan)
    return
  }

  if (!VERIFY_ONLY) await write(db, plan)

  console.log('\nVerifying round-trip:')
  const failures = await verify(db, plan)
  if (failures > 0) {
    console.error(`\n${failures} document(s) did not round-trip cleanly.`)
    process.exitCode = 1
    return
  }
  console.log(`\nAll ${plan.length} documents round-tripped unchanged.`)
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  },
)
