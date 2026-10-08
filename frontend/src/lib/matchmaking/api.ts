import { apiFetch } from '@/lib/api'
import type { Instrument } from '@/lib/schema/types'

export interface MatchedLobby {
  id: string
  state: 'lobby' | 'in_progress'
  instrument: Instrument
  scenarioId: string
  scenarioVersionId: string
  scenarioTitle: string
  scenarioDifficulty: number
  difficultySource: 'crowd' | 'author'
  participants: { uid: string; displayName: string; elo: number; isProvisional: boolean }[]
}

export interface QueueStatus {
  state: 'idle' | 'queued' | 'matched'
  queueId: string | null
  instrument: Instrument | null
  waitSeconds: number
  ratingWindow: number | null
  searchExpanded: boolean
  waitingFor: 'opponent' | 'scenario' | null
  match: MatchedLobby | null
  policyVersion: string
}

export const joinQueue = () =>
  apiFetch<QueueStatus>('/matchmaking/queue', { method: 'POST', body: JSON.stringify({}) })
export const getQueueStatus = () => apiFetch<QueueStatus>('/matchmaking/queue')
export const cancelQueue = (queueId: string, keepalive = false, leaveLobby = true) =>
  apiFetch<QueueStatus>('/matchmaking/queue', {
    method: 'DELETE',
    body: JSON.stringify({ queueId, leaveLobby }),
    keepalive,
  })
