import { beforeEach, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  writes: [] as Array<{ kind: 'set' | 'update'; path: string; data: Record<string, unknown> }>,
  commit: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
  getDoc: async ({ path }: { path: string }) => ({
    exists: () => store.docs.has(path),
    data: () => store.docs.get(path),
  }),
  serverTimestamp: () => 'now',
  writeBatch: () => ({
    set: ({ path }: { path: string }, data: Record<string, unknown>) =>
      store.writes.push({ kind: 'set', path, data }),
    update: ({ path }: { path: string }, data: Record<string, unknown>) =>
      store.writes.push({ kind: 'update', path, data }),
    commit: store.commit,
  }),
}))

import { saveProfileAppearance } from './profileAppearance'

const featuredScores = [{ runId: 'run', scenarioId: 'scenario', finalScore: 900 }]
const appearance = { accent: 'Green' as const, featuredScores }

beforeEach(() => {
  store.docs.clear()
  store.writes.length = 0
  store.commit.mockReset().mockResolvedValue(undefined)
})

it('saves settings and the public profile in one commit', async () => {
  store.docs.set('publicProfile/player', { publicHistory: true })

  await saveProfileAppearance('player', appearance)

  expect(store.commit).toHaveBeenCalledOnce()
  expect(store.writes).toEqual([
    { kind: 'set', path: 'userSettings/player', data: { profileAppearance: appearance } },
    {
      kind: 'update',
      path: 'publicProfile/player',
      data: { profileAppearance: appearance, updatedAt: 'now' },
    },
  ])
})

it('keeps featured scores off the public profile while play history is private', async () => {
  store.docs.set('publicProfile/player', { publicHistory: false })

  await saveProfileAppearance('player', appearance)

  expect(store.writes[1].data.profileAppearance).toEqual({ accent: 'Green', featuredScores: [] })
})

it('only saves settings for a private profile', async () => {
  await saveProfileAppearance('player', appearance)

  expect(store.writes.map(({ path }) => path)).toEqual(['userSettings/player'])
})

it('rejects when the commit fails', async () => {
  store.commit.mockRejectedValueOnce(new Error('offline'))

  await expect(saveProfileAppearance('player', appearance)).rejects.toThrow('offline')
})
