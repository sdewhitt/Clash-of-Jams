import { apiFetch } from '@/lib/api'
import type { DifficultyDetail, DifficultyScenario } from './types'

const root = '/scenario-difficulty'
export const loadExamples = (signal?: AbortSignal) =>
  apiFetch<DifficultyDetail[]>(root + '/examples', { signal })
export const loadDifficultyScenarios = (signal?: AbortSignal) =>
  apiFetch<DifficultyScenario[]>(root + '/scenarios', { signal })
export const loadDifficulty = (id: string, signal?: AbortSignal) =>
  apiFetch<DifficultyDetail>(root + '/scenarios/' + encodeURIComponent(id), { signal })
export const publishDifficulty = (id: string) =>
  apiFetch<DifficultyDetail>(root + '/scenarios/' + encodeURIComponent(id) + '/recompute', {
    method: 'POST',
  })
