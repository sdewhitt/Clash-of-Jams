/** Factories for /leaderboards responses, shaped like backend/app/schemas.py's. */
import type { LeaderboardEntry, LeaderboardResponse } from '@/lib/leaderboards'

export function entry(uid: string, ranking: number, key: number): LeaderboardEntry {
  return {
    uid,
    displayName: `Player ${uid}`,
    ranking,
    key,
    skillRating: null,
    run: { runId: `run-${uid}`, playedAt: '2026-09-20T16:00:00Z' },
  }
}

export function board(overrides: Partial<LeaderboardResponse> = {}): LeaderboardResponse {
  const entries = overrides.entries ?? []
  return {
    entries,
    myEntry: null,
    totalPlayers: entries.length,
    percentile: null,
    earliestPlayedAt: null,
    latestPlayedAt: null,
    ...overrides,
  }
}
