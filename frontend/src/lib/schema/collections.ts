/**
 * Collection paths, derived-id helpers and default document factories.
 *
 * Nothing here touches the Firebase app instance, so this module is safe to
 * import from both the browser app and the Node init script.
 */
import { serverTimestamp, type WithFieldValue } from 'firebase/firestore'

import type {
  ChartPart,
  Community,
  CommunityMembership,
  Friendship,
  GameMatch,
  ImportJob,
  Instrument,
  MatchInvitation,
  MatchParticipant,
  MediaAsset,
  ModerationAction,
  NoteChart,
  Playlist,
  PlaylistItem,
  RecordingShare,
  Run,
  Scenario,
  ScenarioReview,
  ScenarioVersion,
  ScoringRules,
  SkillRating,
  UserProfile,
  UserReport,
  UserSettings,
  UsernameReservation,
} from './types.ts'

/** Bumped whenever a document shape changes in a way that needs a migration. */
export const SCHEMA_VERSION = 1

/** Top-level collections. Subcollections have path helpers below. */
export const COLLECTIONS = {
  users: 'users',
  usernames: 'usernames',
  userSettings: 'userSettings',
  scenarios: 'scenarios',
  mediaAssets: 'mediaAssets',
  runs: 'runs',
  matches: 'matches',
  friendships: 'friendships',
  communities: 'communities',
  playlists: 'playlists',
  scenarioReviews: 'scenarioReviews',
  userReports: 'userReports',
  moderationActions: 'moderationActions',
  matchInvitations: 'matchInvitations',
  recordingShares: 'recordingShares',
  importJobs: 'importJobs',
} as const

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS]

/** Bookkeeping written by the init script. Not application data. */
export const SCHEMA_META_PATH = '_schema/meta'

/* ------------------------------------------------------ subcollections */

export const scenarioVersionsPath = (scenarioId: string) =>
  `${COLLECTIONS.scenarios}/${scenarioId}/versions`

export const matchParticipantsPath = (matchId: string) =>
  `${COLLECTIONS.matches}/${matchId}/participants`

export const skillRatingsPath = (uid: string) => `${COLLECTIONS.users}/${uid}/skillRatings`

export const communityMembersPath = (communityId: string) =>
  `${COLLECTIONS.communities}/${communityId}/members`

export const playlistItemsPath = (playlistId: string) =>
  `${COLLECTIONS.playlists}/${playlistId}/items`

/* --------------------------------------------------------- derived ids */

/** Usernames are reserved case-insensitively (invariant 1). */
export const usernameKey = (username: string) => username.trim().toLowerCase()

/** One document per pair, keyed with the smaller uid first (idA < idB). */
export function friendshipId(uidOne: string, uidTwo: string) {
  const [idA, idB] = uidOne < uidTwo ? [uidOne, uidTwo] : [uidTwo, uidOne]
  return `${idA}_${idB}`
}

/** One review per user per scenario (invariant 3). */
export const scenarioReviewId = (scenarioId: string, reviewerUid: string) =>
  `${scenarioId}_${reviewerUid}`

/** One rating per user per instrument; the instrument is the document id. */
export const skillRatingId = (instrument: Instrument) => instrument

/* ------------------------------------------------------------ defaults */

export const DEFAULT_SCORING_RULES: ScoringRules = {
  pitchWeight: 0.4,
  rhythmWeight: 0.4,
  completenessWeight: 0.2,
  hitWindowMs: 120,
  pitchToleranceCents: 50,
}

/** Starting elo for a player who has never been rated on an instrument. */
export const STARTING_ELO = 1000

/** Matches played before a rating stops being provisional. */
export const PROVISIONAL_MATCHES = 10

/** The "new document" state for the scenario editor: 120bpm, 4/4, no notes. */
export function emptyChart(instrument: Instrument): NoteChart {
  return {
    keySignature: 0,
    tempoMap: [{ atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 }],
    parts: [{ partId: 'lead', name: 'Lead', instrument, notes: [] }],
  }
}

/* --------------------------------------------------- document factories */

/**
 * Each factory returns a complete document with every field present, so a
 * document written through one of these always satisfies the shape in
 * types.ts. They are used by the init script and by the app's write paths.
 */

export function newUserProfile(args: {
  uid: string
  username: string
  displayName?: string
}): WithFieldValue<UserProfile> {
  return {
    uid: args.uid,
    username: args.username,
    usernameLower: usernameKey(args.username),
    displayName: args.displayName ?? args.username,
    avatarUrl: null,
    bio: '',
    role: 'user',
    isBanned: false,
    isSocialRestricted: false,
    isProfilePublic: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}

export function newUsernameReservation(args: {
  uid: string
  username: string
}): WithFieldValue<UsernameReservation> {
  return {
    uid: args.uid,
    username: args.username,
    createdAt: serverTimestamp(),
  }
}

export function newUserSettings(args: {
  uid: string
  preferredInstrument?: Instrument
}): WithFieldValue<UserSettings> {
  return {
    uid: args.uid,
    theme: 'system',
    colorblindMode: 'off',
    reduceFlashing: false,
    preferredInstrument: args.preferredInstrument ?? 'piano',
    inputLatencyOffsetMs: 0,
    masterVolume: 0.8,
    metronomeEnabled: true,
    updatedAt: serverTimestamp(),
  }
}

export function newScenario(args: {
  id: string
  authorUid: string
  title: string
  instrument: Instrument
  description?: string
  visibility?: Scenario['visibility']
  tags?: string[]
  authorDifficulty?: number
}): WithFieldValue<Scenario> {
  return {
    id: args.id,
    authorUid: args.authorUid,
    title: args.title,
    description: args.description ?? '',
    instrument: args.instrument,
    visibility: args.visibility ?? 'private',
    tags: args.tags ?? [],
    authorDifficulty: args.authorDifficulty ?? 1,
    crowdDifficulty: null,
    avgRating: null,
    ratingCount: 0,
    playCount: 0,
    currentVersionId: null,
    currentVersionNumber: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}

export function newScenarioVersion(args: {
  id: string
  scenarioId: string
  versionNumber: number
  createdByUid: string
  chart: NoteChart
  durationMs?: number
  scoringRules?: ScoringRules
  mediaAssetIds?: string[]
}): WithFieldValue<ScenarioVersion> {
  return {
    id: args.id,
    scenarioId: args.scenarioId,
    versionNumber: args.versionNumber,
    chart: args.chart,
    scoringRules: args.scoringRules ?? DEFAULT_SCORING_RULES,
    durationMs: args.durationMs ?? 0,
    mediaAssetIds: args.mediaAssetIds ?? [],
    createdByUid: args.createdByUid,
    createdAt: serverTimestamp(),
  }
}

export function newMediaAsset(args: {
  id: string
  ownerUid: string
  kind: MediaAsset['kind']
  storagePath: string
  contentType: string
  byteSize: number
  durationMs?: number | null
}): WithFieldValue<MediaAsset> {
  return {
    id: args.id,
    ownerUid: args.ownerUid,
    kind: args.kind,
    storagePath: args.storagePath,
    contentType: args.contentType,
    byteSize: args.byteSize,
    durationMs: args.durationMs ?? null,
    createdAt: serverTimestamp(),
  }
}

export function newRun(args: {
  id: string
  userUid: string
  scenarioId: string
  scenarioVersionId: string
  instrument: Instrument
  partId: string
  finalScore: number
  breakdown: Run['breakdown']
  speedMultiplier?: number
  scoringRules?: ScoringRules
  validation?: Run['validation']
  matchId?: string | null
  matchParticipantUid?: string | null
}): WithFieldValue<Run> {
  return {
    id: args.id,
    userUid: args.userUid,
    scenarioId: args.scenarioId,
    scenarioVersionId: args.scenarioVersionId,
    instrument: args.instrument,
    partId: args.partId,
    speedMultiplier: args.speedMultiplier ?? 1,
    scoringRules: args.scoringRules ?? DEFAULT_SCORING_RULES,
    finalScore: args.finalScore,
    breakdown: args.breakdown,
    validation: args.validation ?? 'pending',
    matchId: args.matchId ?? null,
    matchParticipantUid: args.matchParticipantUid ?? null,
    playedAt: serverTimestamp(),
  }
}

export function newMatch(args: {
  id: string
  mode: GameMatch['mode']
  scenarioId: string
  scenarioVersionId: string
  hostUid: string
  participantUids?: string[]
  speedMultiplier?: number
  scoringRules?: ScoringRules
  state?: GameMatch['state']
}): WithFieldValue<GameMatch> {
  return {
    id: args.id,
    mode: args.mode,
    state: args.state ?? 'lobby',
    scenarioId: args.scenarioId,
    scenarioVersionId: args.scenarioVersionId,
    speedMultiplier: args.speedMultiplier ?? 1,
    scoringRules: args.scoringRules ?? DEFAULT_SCORING_RULES,
    hostUid: args.hostUid,
    participantUids: args.participantUids ?? [args.hostUid],
    winnerUid: null,
    createdAt: serverTimestamp(),
    startedAt: null,
    endedAt: null,
  }
}

export function newMatchParticipant(args: {
  uid: string
  matchId: string
  partId: string
  team?: string | null
}): WithFieldValue<MatchParticipant> {
  return {
    uid: args.uid,
    matchId: args.matchId,
    partId: args.partId,
    team: args.team ?? null,
    isReady: false,
    outcome: null,
    finalScore: null,
    runId: null,
    eloDelta: null,
    joinedAt: serverTimestamp(),
  }
}

export function newSkillRating(args: {
  uid: string
  instrument: Instrument
}): WithFieldValue<SkillRating> {
  return {
    uid: args.uid,
    instrument: args.instrument,
    elo: STARTING_ELO,
    tier: 'bronze',
    gamesPlayed: 0,
    isProvisional: true,
    updatedAt: serverTimestamp(),
  }
}

export function newFriendship(args: {
  uidOne: string
  uidTwo: string
  requestedByUid: string
  state?: Friendship['state']
}): WithFieldValue<Friendship> {
  const [idA, idB] =
    args.uidOne < args.uidTwo ? [args.uidOne, args.uidTwo] : [args.uidTwo, args.uidOne]
  return {
    id: friendshipId(idA, idB),
    idA,
    idB,
    requestedByUid: args.requestedByUid,
    state: args.state ?? 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}

export function newCommunity(args: {
  id: string
  name: string
  ownerUid: string
  description?: string
  isPublic?: boolean
}): WithFieldValue<Community> {
  return {
    id: args.id,
    name: args.name,
    description: args.description ?? '',
    ownerUid: args.ownerUid,
    isPublic: args.isPublic ?? true,
    memberCount: 1,
    createdAt: serverTimestamp(),
  }
}

export function newCommunityMembership(args: {
  uid: string
  communityId: string
  role?: CommunityMembership['role']
}): WithFieldValue<CommunityMembership> {
  return {
    uid: args.uid,
    communityId: args.communityId,
    role: args.role ?? 'member',
    joinedAt: serverTimestamp(),
  }
}

export function newPlaylist(args: {
  id: string
  ownerUid: string
  name: string
  description?: string
  isPublic?: boolean
}): WithFieldValue<Playlist> {
  return {
    id: args.id,
    ownerUid: args.ownerUid,
    name: args.name,
    description: args.description ?? '',
    isPublic: args.isPublic ?? false,
    itemCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}

export function newPlaylistItem(args: {
  id: string
  playlistId: string
  scenarioId: string
  position: number
}): WithFieldValue<PlaylistItem> {
  return {
    id: args.id,
    playlistId: args.playlistId,
    scenarioId: args.scenarioId,
    position: args.position,
    addedAt: serverTimestamp(),
  }
}

export function newScenarioReview(args: {
  scenarioId: string
  reviewerUid: string
  rating: number
  comment?: string
}): WithFieldValue<ScenarioReview> {
  return {
    id: scenarioReviewId(args.scenarioId, args.reviewerUid),
    scenarioId: args.scenarioId,
    reviewerUid: args.reviewerUid,
    rating: args.rating,
    comment: args.comment ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
}

export function newUserReport(args: {
  id: string
  reporterUid: string
  targetType: UserReport['targetType']
  targetId: string
  reason: string
  description?: string
}): WithFieldValue<UserReport> {
  return {
    id: args.id,
    reporterUid: args.reporterUid,
    targetType: args.targetType,
    targetId: args.targetId,
    reason: args.reason,
    description: args.description ?? '',
    state: 'open',
    createdAt: serverTimestamp(),
    resolvedAt: null,
  }
}

export function newModerationAction(args: {
  id: string
  moderatorUid: string
  targetType: ModerationAction['targetType']
  targetId: string
  action: ModerationAction['action']
  reportId?: string | null
  notes?: string
}): WithFieldValue<ModerationAction> {
  return {
    id: args.id,
    moderatorUid: args.moderatorUid,
    reportId: args.reportId ?? null,
    targetType: args.targetType,
    targetId: args.targetId,
    action: args.action,
    notes: args.notes ?? '',
    createdAt: serverTimestamp(),
  }
}

export function newMatchInvitation(args: {
  id: string
  matchId: string
  fromUid: string
  toUid: string
  expiresAt: MatchInvitation['expiresAt']
}): WithFieldValue<MatchInvitation> {
  return {
    id: args.id,
    matchId: args.matchId,
    fromUid: args.fromUid,
    toUid: args.toUid,
    state: 'pending',
    createdAt: serverTimestamp(),
    expiresAt: args.expiresAt,
  }
}

export function newRecordingShare(args: {
  id: string
  ownerUid: string
  runId: string
  scenarioId: string
  mediaAssetId: string
  caption?: string
  visibility?: RecordingShare['visibility']
}): WithFieldValue<RecordingShare> {
  return {
    id: args.id,
    ownerUid: args.ownerUid,
    runId: args.runId,
    scenarioId: args.scenarioId,
    mediaAssetId: args.mediaAssetId,
    caption: args.caption ?? '',
    visibility: args.visibility ?? 'private',
    createdAt: serverTimestamp(),
  }
}

export function newImportJob(args: {
  id: string
  ownerUid: string
  source: ImportJob['source']
  sourceAssetId: string
}): WithFieldValue<ImportJob> {
  return {
    id: args.id,
    ownerUid: args.ownerUid,
    source: args.source,
    sourceAssetId: args.sourceAssetId,
    state: 'queued',
    scenarioId: null,
    error: null,
    createdAt: serverTimestamp(),
    completedAt: null,
  }
}

/** Convenience for the editor and the seed data: a single-part chart. */
export function chartWithPart(part: ChartPart, keySignature = 0): NoteChart {
  return {
    keySignature,
    tempoMap: [{ atBeat: 0, bpm: 120, timeSigNum: 4, timeSigDen: 4 }],
    parts: [part],
  }
}
