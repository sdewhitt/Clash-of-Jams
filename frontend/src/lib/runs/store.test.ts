/** Submitting a run: the pending write to Firestore, then the backend's verdict. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SCORING_RULES } from '@/lib/schema/collections'

const written = new Map<string, Record<string, unknown>>()

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return {
    ...actual,
    collection: (_db: unknown, path: string) => ({ path }),
    doc: (parent: { path: string }) => ({ id: 'run-1', path: `${parent.path}/run-1` }),
    setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
      written.set(ref.path, data)
    }),
  }
})

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

const { apiFetch } = await import('@/lib/api')
const { submitRun } = await import('@/lib/runs/store')

const run = {
  uid: 'user-1',
  scenarioId: 's1',
  scenarioVersionId: 'v1',
  instrument: 'guitar' as const,
  partId: 'lead',
  speedMultiplier: 1,
  scoringRules: DEFAULT_SCORING_RULES,
  finalScore: 82.5,
  breakdown: {
    pitchAccuracy: 80,
    rhythmAccuracy: 80,
    completeness: 92.5,
    notesHit: 3,
    notesMissed: 0,
    extraNotes: 0,
    noteResults: [],
  },
}

beforeEach(() => {
  written.clear()
  vi.mocked(apiFetch).mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('submitRun', () => {
  it('writes the run as pending, then asks the backend to validate it', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ validation: 'accepted', reason: null })

    const result = await submitRun(run)

    expect(written.get('runs/run-1')).toMatchObject({
      id: 'run-1',
      userUid: 'user-1',
      scenarioVersionId: 'v1',
      finalScore: 82.5,
      validation: 'pending',
      matchId: null,
    })
    expect(apiFetch).toHaveBeenCalledWith('/runs/run-1/validate', { method: 'POST' })
    expect(result).toEqual({ runId: 'run-1', validation: 'accepted', reason: null })
  })

  it('passes on why a run was rejected', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ validation: 'rejected', reason: 'Part has no notes' })

    expect(await submitRun(run)).toMatchObject({
      validation: 'rejected',
      reason: 'Part has no notes',
    })
  })

  it('keeps the saved run as pending when the backend is unreachable', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('Failed to fetch'))

    expect(await submitRun(run)).toEqual({ runId: 'run-1', validation: 'pending', reason: null })
    expect(written.has('runs/run-1')).toBe(true)
  })

  it('refuses to save without a signed-in user', async () => {
    await expect(submitRun({ ...run, uid: null })).rejects.toThrow('Sign in')
    expect(written.size).toBe(0)
  })
})
