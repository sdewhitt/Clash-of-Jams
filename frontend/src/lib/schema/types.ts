/**
 * Firestore document shapes for Clash of Jams.
 *
 * These mirror the "Primary Database Components" and "Social Database Diagram
 * Components" sections of the design document. Every collection in the design
 * appears here exactly once, so this file is the single source of truth that
 * other stories build against.
 *
 * Conventions used throughout:
 *  - Timestamp fields are Firestore timestamps; writers use serverTimestamp().
 *  - Derived ids (friendships, scenarioReviews, ...) have a helper in
 *    collections.ts that builds them, so the uniqueness invariants in the
 *    design document are enforced by the document key itself.
 *  - Musical content (charts, parts, notes) is embedded rather than stored as
 *    separate documents, as the design document requires.
 */
import type { Timestamp } from 'firebase/firestore'

/* ------------------------------------------------------------------ enums */

export const ROLES = ['user', 'moderator', 'admin'] as const
export type Role = (typeof ROLES)[number]

export const INSTRUMENTS = ['piano', 'guitar', 'woodwind', 'vocals', 'midi'] as const
export type Instrument = (typeof INSTRUMENTS)[number]

export const VISIBILITIES = ['private', 'unlisted', 'public'] as const
export type Visibility = (typeof VISIBILITIES)[number]

export const RUN_VALIDATIONS = ['pending', 'accepted', 'rejected'] as const
export type RunValidation = (typeof RUN_VALIDATIONS)[number]

export const MATCH_STATES = ['queued', 'lobby', 'in_progress', 'complete', 'abandoned'] as const
export type MatchState = (typeof MATCH_STATES)[number]

export const MATCH_MODES = ['solo', 'versus_1v1', 'band'] as const
export type MatchMode = (typeof MATCH_MODES)[number]

export const MATCH_OUTCOMES = ['win', 'loss', 'draw', 'forfeit'] as const
export type MatchOutcome = (typeof MATCH_OUTCOMES)[number]

export const RANK_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const
export type RankTier = (typeof RANK_TIERS)[number]

export const MEDIA_KINDS = ['audio', 'video', 'image', 'midi', 'sheet_music'] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]

export const IMPORT_SOURCES = ['midi', 'musicxml', 'sheet_image'] as const
export type ImportSource = (typeof IMPORT_SOURCES)[number]

export const JOB_STATES = ['queued', 'running', 'succeeded', 'failed'] as const
export type JobState = (typeof JOB_STATES)[number]

export const REPORT_STATES = ['open', 'reviewing', 'resolved', 'dismissed'] as const
export type ReportState = (typeof REPORT_STATES)[number]

export const INVITATION_STATES = ['pending', 'accepted', 'declined', 'expired'] as const
export type InvitationState = (typeof INVITATION_STATES)[number]

export const FRIENDSHIP_STATES = ['pending', 'accepted', 'blocked'] as const
export type FriendshipState = (typeof FRIENDSHIP_STATES)[number]

export const COMMUNITY_ROLES = ['owner', 'moderator', 'member'] as const
export type CommunityRole = (typeof COMMUNITY_ROLES)[number]

export const HIT_VERDICTS = ['hit', 'missed', 'early', 'late', 'wrong_pitch', 'extra'] as const
export type HitVerdict = (typeof HIT_VERDICTS)[number]

export type ModerationTargetType = 'user' | 'scenario' | 'recording'

/* ------------------------------------------------------- primary database */

/**
 * users/{uid} — the design document's User Profile.
 *
 * The document id is the Firebase Auth uid. Credentials live in Firebase Auth
 * and must never be copied here; this document holds only public-facing and
 * authorization state.
 */
export interface UserProfile {
  uid: string
  username: string
  /** Lowercased username, mirrored into usernames/{usernameLower}. */
  usernameLower: string
  displayName: string
  avatarUrl: string | null
  bio: string
  role: Role
  /** Moderation state — set by the admin module, never by the user. */
  isBanned: boolean
  isSocialRestricted: boolean
  isProfilePublic: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** usernames/{usernameLower} — reservation document enforcing invariant 1. */
export interface UsernameReservation {
  uid: string
  username: string
  createdAt: Timestamp
}

/** userSettings/{uid} — themes, accessibility options, instrument preferences. */
export interface UserSettings {
  uid: string
  theme: string
  colorblindMode: 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia'
  reduceFlashing: boolean
  preferredInstrument: Instrument
  /** Milliseconds of input latency the gameplay engine compensates for. */
  inputLatencyOffsetMs: number
  masterVolume: number
  metronomeEnabled: boolean
  updatedAt: Timestamp
}

/**
 * scenarios/{scenarioId} — ownership and metadata only.
 *
 * Immutable except for aggregates and the pointer to the current version; the
 * playable musical content lives in scenarios/{scenarioId}/versions/{versionId}.
 */
export interface Scenario {
  id: string
  authorUid: string
  title: string
  description: string
  instrument: Instrument
  visibility: Visibility
  tags: string[]
  /** The author's own grading, 1-10. */
  authorDifficulty: number
  /** Derived from observed runs; null until enough runs exist. */
  crowdDifficulty: number | null
  avgRating: number | null
  ratingCount: number
  playCount: number
  currentVersionId: string | null
  currentVersionNumber: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** A tempo or meter change at a given beat. */
export interface TempoMapEntry {
  atBeat: number
  bpm: number
  timeSigNum: number
  timeSigDen: number
}

/** One expected note. Onsets are in beats, so the speed modifier stays cosmetic. */
export interface ExpectedNote {
  index: number
  midiPitch: number
  startBeat: number
  durationBeats: number
  velocity: number
}

/** One playable part (e.g. the guitar line) inside a chart. */
export interface ChartPart {
  partId: string
  name: string
  instrument: Instrument
  notes: ExpectedNote[]
}

/** Embedded musical content — never split into separate documents. */
export interface NoteChart {
  keySignature: number
  tempoMap: TempoMapEntry[]
  parts: ChartPart[]
}

/** Scoring regime; copied onto runs so old scores stay reproducible. */
export interface ScoringRules {
  pitchWeight: number
  rhythmWeight: number
  completenessWeight: number
  /** Timing window, in ms, within which a note counts as on time. */
  hitWindowMs: number
  /** Cents of pitch deviation tolerated before a note counts as wrong. */
  pitchToleranceCents: number
}

/**
 * scenarios/{scenarioId}/versions/{versionId} — immutable musical content.
 *
 * versionNumber is unique per scenario (invariant 2). Leaderboards are scoped
 * to a version so every run on one was scored against identical note data.
 */
export interface ScenarioVersion {
  id: string
  scenarioId: string
  versionNumber: number
  chart: NoteChart
  scoringRules: ScoringRules
  durationMs: number
  /** MediaAsset ids backing this version (backing track, sheet images, ...). */
  mediaAssetIds: string[]
  createdByUid: string
  createdAt: Timestamp
}

/** mediaAssets/{assetId} — a file in Cloud Storage plus its owner. */
export interface MediaAsset {
  id: string
  ownerUid: string
  kind: MediaKind
  storagePath: string
  contentType: string
  byteSize: number
  durationMs: number | null
  createdAt: Timestamp
}

/** Per-note scoring detail, rendered by the explainability view. */
export interface NoteResult {
  expectedNoteIndex: number
  verdict: HitVerdict
  timingDeltaMs: number
  centsDeviation: number
}

/** The results-screen summary of a run. */
export interface ScoreBreakdown {
  pitchAccuracy: number
  rhythmAccuracy: number
  completeness: number
  notesHit: number
  notesMissed: number
  extraNotes: number
  noteResults: NoteResult[]
}

/**
 * runs/{runId} — one user's completed attempt.
 *
 * Competitive runs reference a match participant; solo runs leave those null.
 * Leaderboards are derived from runs with validation === 'accepted' — the
 * design document is explicit that they are not a second table.
 */
export interface Run {
  id: string
  userUid: string
  scenarioId: string
  scenarioVersionId: string
  instrument: Instrument
  /** The part of the chart the player performed. */
  partId: string
  speedMultiplier: number
  scoringRules: ScoringRules
  finalScore: number
  breakdown: ScoreBreakdown
  validation: RunValidation
  matchId: string | null
  matchParticipantUid: string | null
  playedAt: Timestamp
}

/** matches/{matchId} — the design document's GameMatch. */
export interface GameMatch {
  id: string
  mode: MatchMode
  state: MatchState
  scenarioId: string
  scenarioVersionId: string
  speedMultiplier: number
  scoringRules: ScoringRules
  hostUid: string
  participantUids: string[]
  winnerUid: string | null
  createdAt: Timestamp
  startedAt: Timestamp | null
  endedAt: Timestamp | null
}

/** matches/{matchId}/participants/{uid} — assigned part, team, readiness. */
export interface MatchParticipant {
  uid: string
  matchId: string
  partId: string
  team: string | null
  isReady: boolean
  outcome: MatchOutcome | null
  finalScore: number | null
  runId: string | null
  eloDelta: number | null
  joinedAt: Timestamp
}

/**
 * users/{uid}/skillRatings/{instrument} — one rating per user per instrument.
 *
 * Written only by server-side code after a match is finalized; the elo change
 * and the match finalization must commit together (invariant 5).
 */
export interface SkillRating {
  uid: string
  instrument: Instrument
  elo: number
  tier: RankTier
  gamesPlayed: number
  isProvisional: boolean
  updatedAt: Timestamp
}

/* -------------------------------------------------------- social database */

/**
 * friendships/{idA_idB} — one document per pair, with idA < idB.
 *
 * That ordering is what keeps the pair unique regardless of who initiated.
 */
export interface Friendship {
  id: string
  idA: string
  idB: string
  requestedByUid: string
  state: FriendshipState
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** communities/{communityId} */
export interface Community {
  id: string
  name: string
  description: string
  ownerUid: string
  isPublic: boolean
  memberCount: number
  createdAt: Timestamp
}

/** communities/{communityId}/members/{uid} */
export interface CommunityMembership {
  uid: string
  communityId: string
  role: CommunityRole
  joinedAt: Timestamp
}

/** playlists/{playlistId} */
export interface Playlist {
  id: string
  ownerUid: string
  name: string
  description: string
  isPublic: boolean
  itemCount: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** playlists/{playlistId}/items/{itemId} */
export interface PlaylistItem {
  id: string
  playlistId: string
  scenarioId: string
  /** Zero-based ordering within the playlist. */
  position: number
  addedAt: Timestamp
}

/**
 * scenarioReviews/{scenarioId}_{uid} — one review per user per scenario.
 *
 * The composite id is what enforces invariant 3.
 */
export interface ScenarioReview {
  id: string
  scenarioId: string
  reviewerUid: string
  /** 1-5 stars. */
  rating: number
  comment: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

/** userReports/{reportId} */
export interface UserReport {
  id: string
  reporterUid: string
  targetType: ModerationTargetType
  targetId: string
  reason: string
  description: string
  state: ReportState
  createdAt: Timestamp
  resolvedAt: Timestamp | null
}

/** moderationActions/{actionId} */
export interface ModerationAction {
  id: string
  moderatorUid: string
  reportId: string | null
  targetType: ModerationTargetType
  targetId: string
  action: 'warn' | 'restrict_social' | 'ban' | 'unpublish' | 'dismiss'
  notes: string
  createdAt: Timestamp
}

/** matchInvitations/{invitationId} */
export interface MatchInvitation {
  id: string
  matchId: string
  fromUid: string
  toUid: string
  state: InvitationState
  createdAt: Timestamp
  expiresAt: Timestamp
}

/** recordingShares/{shareId} — a run recording the owner chose to publish. */
export interface RecordingShare {
  id: string
  ownerUid: string
  runId: string
  scenarioId: string
  mediaAssetId: string
  caption: string
  visibility: Visibility
  createdAt: Timestamp
}

/** importJobs/{jobId} — sheet music image, MusicXML and MIDI ingestion. */
export interface ImportJob {
  id: string
  ownerUid: string
  source: ImportSource
  sourceAssetId: string
  state: JobState
  /** Set once the job produces a draft scenario. */
  scenarioId: string | null
  error: string | null
  createdAt: Timestamp
  completedAt: Timestamp | null
}

/** _schema/meta — written by the init script so runs are traceable. */
export interface SchemaMeta {
  schemaVersion: number
  collections: string[]
  initializedAt: Timestamp
  initializedBy: string
}
