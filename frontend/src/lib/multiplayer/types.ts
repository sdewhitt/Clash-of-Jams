import type { Instrument, RatingEvent } from '../schema/types.ts'

export const PRESET_MESSAGES = [
  { id: 'well_done', text: 'Well done!', key: 'ArrowUp', shortcut: '↑' },
  { id: 'challenge', text: 'Best you can do?', key: 'ArrowRight', shortcut: '→' },
  { id: 'thanks', text: 'Thanks!', key: 'ArrowDown', shortcut: '↓' },
  { id: 'good_game', text: 'Good game!', key: 'ArrowLeft', shortcut: '←' },
] as const

export interface SessionPlayer {
  uid: string
  displayName: string
  elo: number
  isReady: boolean
  connected: boolean
  reconnectUntilMs: number | null
  score: number
  beatsHit: number
  /** Zero-based beats this player hit, ascending. Absent from older servers. */
  hitBeats?: number[]
  allowSpectators?: boolean
}

export interface SessionSnapshot {
  id: string
  state: 'lobby' | 'in_progress' | 'complete' | 'abandoned'
  protocolVersion: string
  instrument: Instrument
  scenarioId: string
  scenarioVersionId: string
  scenarioTitle: string
  scenarioDifficulty: number
  difficultySource: 'author' | 'crowd'
  inputSource: 'demo'
  serverSequence: number
  yourLastSequence: number
  serverTimeMs: number
  startedAtMs: number | null
  durationMs: number
  beatMs: number
  totalBeats: number
  participants: SessionPlayer[]
  messages: { id: number; uid: string; text: string; atMs: number; system?: boolean; reactions?: Record<string, number> }[]
  finalizing: boolean
  completionReason: string | null
  ratingEvents: (Omit<RatingEvent, 'appliedAt'> & { appliedAt: string })[]
}

export interface SessionEvent {
  eventId: string
  sequence: number
  kind: 'ready' | 'demo_hit' | 'emote' | 'resign' | 'spectating'
  allowSpectators?: boolean
  phrase?: (typeof PRESET_MESSAGES)[number]['id']
}

export interface SessionReply {
  type: 'snapshot'
  disposition: 'snapshot' | 'accepted' | 'duplicate' | 'rejected'
  eventId: string | null
  error: string | null
  snapshot: SessionSnapshot
}
