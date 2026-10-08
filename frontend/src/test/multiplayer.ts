import type { SessionSnapshot } from '@/lib/multiplayer/types'

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
