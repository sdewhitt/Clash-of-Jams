import { beforeEach, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  writes: [] as Array<{ kind: 'set' | 'update'; path: string; data: Record<string, unknown> }>,
}))

vi.mock('@/lib/firebase', () => ({ db: {} }))

vi.mock('firebase/firestore', () => {
  const snapshot = (path: string) => ({
    exists: () => store.docs.has(path),
    data: () => store.docs.get(path),
  })
  return {
    doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
    getDoc: vi.fn(async ({ path }: { path: string }) => snapshot(path)),
    serverTimestamp: () => 'now',
    arrayRemove: vi.fn(),
    deleteDoc: vi.fn(),
    updateDoc: vi.fn(),
    runTransaction: vi.fn(async (_db: unknown, run: (transaction: unknown) => Promise<void>) =>
      run({
        get: async ({ path }: { path: string }) => snapshot(path),
        set: ({ path }: { path: string }, data: Record<string, unknown>) =>
          store.writes.push({ kind: 'set', path, data }),
        update: ({ path }: { path: string }, data: Record<string, unknown>) =>
          store.writes.push({ kind: 'update', path, data }),
      }),
    ),
  }
})

import { findPublicProfile, updateEloPublicity, updatePublicProfile } from './publicProfile'

const featuredScores = [{ runId: 'run', scenarioId: 'scenario', finalScore: 900 }]

function publish(publicHistory: boolean) {
  return updatePublicProfile('player', 'Player', true, true, 'Bio', true, 'piano', true, ['jazz'], [], true, 'avatar.png', publicHistory)
}

beforeEach(() => {
  store.docs.clear()
  store.writes.length = 0
})

it('reads a missing public document as a private profile', async () => {
  await expect(findPublicProfile('player')).resolves.toBeNull()
})

it('restores the saved appearance when a private profile becomes public again', async () => {
  store.docs.set('userSettings/player', { profileAppearance: { accent: 'Green', featuredScores } })

  await publish(true)

  expect(store.writes).toHaveLength(1)
  expect(store.writes[0].path).toBe('publicProfile/player')
  expect(store.writes[0].data).toMatchObject({
    friends: [],
    communities: [],
    profileAppearance: { accent: 'Green', featuredScores },
  })
})

it('keeps featured scores off the public document while play history is private', async () => {
  store.docs.set('userSettings/player', { profileAppearance: { accent: 'Green', featuredScores } })

  await publish(false)

  expect(store.writes[0].data.profileAppearance).toEqual({ accent: 'Green', featuredScores: [] })
})

it('does not reset friends and communities on a profile that is already public', async () => {
  store.docs.set('publicProfile/player', { friends: ['friend'] })

  await publish(true)

  expect(store.writes[0].data).not.toHaveProperty('friends')
  expect(store.writes[0].data).not.toHaveProperty('communities')
})

it('saves publicity settings without touching a public document that does not exist', async () => {
  await updateEloPublicity('player', ['piano'])

  expect(store.writes.map(({ path }) => path)).toEqual(['userSettings/player'])
})
