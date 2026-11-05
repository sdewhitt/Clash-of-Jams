import type { SessionSnapshot } from '@/lib/multiplayer/types'

type SnapshotRatingEvent = SessionSnapshot['ratingEvents'][number]

/** user-1 (400) beats user-2 (450): expected 0.43, K 32, so +18.3. */
export function ratingEvent(overrides: Partial<SnapshotRatingEvent> = {}): SnapshotRatingEvent {
  return {
    matchId: 'match-1',
    uid: 'user-1',
    opponentUid: 'user-2',
    instrument: 'piano',
    outcome: 'win',
    reason: 'completed',
    score: 0.8,
    opponentScore: 0.5,
    eloBefore: 400,
    opponentEloBefore: 450,
    eloAfter: 418.3,
    eloDelta: 18.3,
    expectedScore: 0.4285,
    actualScore: 1,
    kFactor: 32,
    gamesPlayedBefore: 3,
    gamesPlayedAfter: 4,
    isProvisional: true,
    tierAfter: 'bronze',
    modelVersion: 'elo-v1',
    appliedAt: '2026-10-30T12:00:00Z',
    ...overrides,
  }
}

export function sessionSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    id: 'match-1',
    state: 'lobby',
    protocolVersion: 'multiplayer-v1',
    instrument: 'piano',
    scenarioId: 'riff',
    scenarioVersionId: 'v1',
    scenarioTitle: 'Shared riff',
    scenarioDifficulty: 1,
    difficultySource: 'author',
    inputSource: 'demo',
    serverSequence: 1,
    yourLastSequence: 0,
    serverTimeMs: 1_700_000_000_000,
    startedAtMs: null,
    durationMs: 60_000,
    beatMs: 1000,
    totalBeats: 60,
    participants: ['user-1', 'user-2'].map((uid) => ({
      uid,
      displayName: uid === 'user-1' ? 'Player One' : 'Player Two',
      elo: 400,
      isReady: false,
      connected: true,
      reconnectUntilMs: null,
      score: 0,
      beatsHit: 0,
    })),
    messages: [],
    finalizing: false,
    completionReason: null,
    ratingEvents: [],
    ...overrides,
  }
}
