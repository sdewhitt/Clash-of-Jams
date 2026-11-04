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
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'

import {
  COLLECTIONS,
  SCHEMA_META_PATH,
  SCHEMA_VERSION,
  chartWithPart,
  communityAnnouncementsPath,
  communityMembersPath,
  communityRequestsPath,
  friendshipId,
  matchParticipantsPath,
  newCommunity,
  newCommunityAnnouncement,
  newCommunityMembership,
  newCommunityRequest,
  newFriendship,
  newImportJob,
  newMatch,
  newMatchInvitation,
  newMatchParticipant,
  newMediaAsset,
  newModerationAction,
  newPlaylist,
  newPublicProfile,
  newRecordingShare,
  newRun,
  newScenario,
  newScenarioReview,
  newScenarioVersion,
  newSkillRating,
  newUserPreferences,
  newUserProfile,
  newUserReport,
  newUserSettings,
  newUserStatus,
  newUsernameReservation,
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
const REPORT_ID = `${PREFIX}report`
const ACTION_ID = `${PREFIX}moderation_action`
const INVITATION_ID = `${PREFIX}invitation`
const INVITATION_LOCK =  `${PREFIX}invitation_lock`
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
      data: newUserSettings({ uid: UID_A }),
    },
    {
      path: `${COLLECTIONS.userSettings}/${UID_B}`,
      entity: 'UserSettings',
      data: newUserSettings({ uid: UID_B }),
    },
    {
      path: `${COLLECTIONS.userPreferences}/${UID_A}`,
      entity: 'UserPreferences',
      data: newUserPreferences(),
    },
    {
      path: `${COLLECTIONS.userPreferences}/${UID_B}`,
      entity: 'UserPreferences',
      data: newUserPreferences(),
    },
    {
      path: `${COLLECTIONS.userStatus}/${UID_A}`,
      entity: 'UserStatus',
      data: newUserStatus(),
    },
    {
      path: `${COLLECTIONS.userStatus}/${UID_B}`,
      entity: 'UserStatus',
      data: newUserStatus(),
    },
    {
      path: `${COLLECTIONS.publicProfile}/${UID_A}`,
      entity: 'PublicProfile',
      data: newPublicProfile({ uid: UID_A, username: 'SeedPlayerA', displayName: 'Seed Player A', acceptingFriends: true }),
    },
    {
      path: `${COLLECTIONS.publicProfile}/${UID_B}`,
      entity: 'PublicProfile',
      data: newPublicProfile({ uid: UID_B, username: 'SeedPlayerB', displayName: 'Seed Player B', acceptingFriends: true }),
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
      path: `${COLLECTIONS.friendRequests}/${friendshipId(UID_A, UID_B)}`,
      entity: 'FriendRequets',
      data: {potentialFriends: [UID_A, UID_B], initiatorUid: UID_A, status: 'accepted', createdAt: serverTimestamp()},
    },
    {
      path: `${COLLECTIONS.friendships}/${friendshipId(UID_A, UID_B)}`,
      entity: 'Friendship',
      data: newFriendship({
        uidOne: UID_A,
        uidTwo: UID_B,
      }),
    },
    {
      path: `${COLLECTIONS.communities}/${COMMUNITY_ID}`,
      entity: 'Community',
      data: newCommunity({
        id: COMMUNITY_ID,
        name: 'Seed Community',
        communityIcon: "data:image/jpeg;base64,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",
        ownerUid: UID_A,
        description: 'Template community written by scripts/init-firestore.ts.',
        isPublic: true,
      }),
    },
    {
      path: `${communityMembersPath(COMMUNITY_ID)}/${UID_A}`,
      entity: 'CommunityMembership',
      data: newCommunityMembership({ uid: UID_A, userDisplayName: "Seed User A", communityId: COMMUNITY_ID, role: 'owner' }),
    },
    {
      path: `${communityAnnouncementsPath(COMMUNITY_ID)}/seed_community_announcement`,
      entity: 'CommunityAnnouncement',
      data: newCommunityAnnouncement({ announcerUid: UID_A, announcementTitle: 'Seed Creation Announcement', announcement: 'This is a sample announcenment!', announcementViewers: ['owner', 'moderator']}),
    },
    {
      path: `${communityRequestsPath(COMMUNITY_ID)}/${UID_B}_${COMMUNITY_ID}`,
      entity: 'CommunityRequest',
      data: newCommunityRequest({memberUid: UID_A, outsiderUid: UID_B, requestType: 'community_invitation_request'}),
    },
    {
      path: `${COLLECTIONS.playlists}/${PLAYLIST_ID}`,
      entity: 'Playlist',
      data: {
        ...newPlaylist({ id: PLAYLIST_ID, ownerUid: UID_A, name: 'Seed Playlist' }),
        scenarioIds: [SCENARIO_ID],
      },
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
      path: `${COLLECTIONS.friendMatchInvitationLocks}/${INVITATION_LOCK}`,
      entity: 'FriendMatchInvitationLocks',
      data: {et: 'dummy initialization value'},
    },
    {
      path: `${COLLECTIONS.matchInvitations}/${INVITATION_ID}`,
      entity: 'MatchInvitation',
      data: newMatchInvitation({
        id: INVITATION_ID,
        matchId: MATCH_ID,
        fromUid: UID_A,
        toUid: UID_B,
        fromScenarioId: SCENARIO_ID,
        fromScenarioVersion: VERSION_ID,
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
