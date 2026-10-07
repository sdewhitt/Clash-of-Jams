/**
 * Response shapes for the /leaderboards routes, shared by the ELO page and the
 * scenario leaderboard.
 *
 * Mirrors LeaderboardResponse and friends in backend/app/schemas.py. These are
 * API shapes, not Firestore documents, so timestamps arrive as ISO strings
 * rather than Firestore Timestamps.
 */
import type { SkillRating } from '@/lib/schema/types'

export type ApiSkillRating = Omit<SkillRating, 'updatedAt'> & { updatedAt: string }

export type RunSummary = {
  runId: string
  playedAt: string
}

export type LeaderboardEntry = {
  uid: string
  displayName: string
  ranking: number
  /** ELO on the ELO board, best score on a scenario board. */
  key: number
  /** Only set on the ELO board. */
  skillRating: ApiSkillRating | null
  /** Only set on scenario boards. */
  run: RunSummary | null
}

export type LeaderboardResponse = {
  entries: LeaderboardEntry[]
  /** The caller's own entry, even when they're outside `entries`; null if they have none. */
  myEntry: LeaderboardEntry | null
  totalPlayers: number
  /** "Top X%" as a fraction: 0.05 means top 5%. Null when myEntry is null. */
  percentile: number | null
  /** Scenario boards only: the date slider's bounds. */
  earliestPlayedAt: string | null
  latestPlayedAt: string | null
}

/** "Top 5%", rounded up so we never claim a better standing than the real one. */
export function formatTopPercent(percentile: number): string {
  const percent = percentile * 100
  return percent < 1 ? `Top ${percent.toFixed(1)}%` : `Top ${Math.ceil(percent)}%`
}
