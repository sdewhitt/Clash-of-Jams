/**
 * User story #67: provider sign-in and the account entry it creates.
 *
 * Firebase Auth and Firestore are replaced with in-memory fakes: a document is
 * a path in `store`, and a batch applies its writes only on commit.
 */
import type { User } from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { INSTRUMENTS } from '@/lib/schema/types'

const store = new Map<string, Record<string, unknown>>()
const commits: string[][] = []

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>()
  return {
    ...actual,
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    getDoc: vi.fn(async (ref: { path: string }) => ({
      exists: () => store.has(ref.path),
      data: () => store.get(ref.path),
    })),
    writeBatch: vi.fn(() => {
      const pending: Array<[string, Record<string, unknown>]> = []
      return {
        set(ref: { path: string }, data: Record<string, unknown>) {
          pending.push([ref.path, data])
        },
        async commit() {
          for (const [docPath, data] of pending) store.set(docPath, data)
          commits.push(pending.map(([docPath]) => docPath))
        },
      }
    }),
  }
})

vi.mock('firebase/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/auth')>()
  return {
    ...actual,
    signInWithPopup: vi.fn(),
    signOut: vi.fn(async () => {}),
  }
})

const { GoogleAuthProvider, signInWithPopup, signOut } = await import('firebase/auth')
const { auth } = await import('@/lib/firebase')
const { authErrorMessage, ensureAccountDocuments, signInWithGoogle, signOutCurrentUser } =
  await import('@/lib/auth/account')

function googleUser(overrides: Partial<User> = {}): User {
  return {
    uid: 'google-uid-12345',
    email: 'ada.lovelace@example.com',
    displayName: 'Ada Lovelace',
    ...overrides,
  } as User
}

function popupReturns(user: User) {
  vi.mocked(signInWithPopup).mockResolvedValue({ user } as Awaited<
    ReturnType<typeof signInWithPopup>
  >)
}

// Top-level entries only: each user also gets a skillRatings subcollection.
const userDocs = () => [...store.keys()].filter((key) => /^users\/[^/]+$/.test(key))

beforeEach(() => {
  store.clear()
  commits.length = 0
  vi.mocked(signInWithPopup).mockReset()
  vi.mocked(signOut).mockClear()
})

describe('signInWithGoogle', () => {
  it('returns the signed-in user for a valid credential', async () => {
    const user = googleUser()
    popupReturns(user)

    await expect(signInWithGoogle()).resolves.toBe(user)

    expect(signInWithPopup).toHaveBeenCalledOnce()
    const [calledAuth, provider] = vi.mocked(signInWithPopup).mock.calls[0]
    expect(calledAuth).toBe(auth)
    expect(provider).toBeInstanceOf(GoogleAuthProvider)
  })

  it.each([
    ['auth/invalid-credential', 'Incorrect email or password.'],
    ['auth/popup-closed-by-user', 'The sign-in window was closed before finishing.'],
  ])('rejects a failed %s credential without writing an entry', async (code, message) => {
    const failure = Object.assign(new Error(code), { code })
    vi.mocked(signInWithPopup).mockRejectedValue(failure)

    await expect(signInWithGoogle()).rejects.toBe(failure)

    expect(authErrorMessage(failure)).toBe(message)
    expect(store.size).toBe(0)
  })

  it('creates exactly one user entry, keyed to the provider uid, on first sign-in', async () => {
    popupReturns(googleUser())

    await signInWithGoogle()

    expect(userDocs()).toEqual(['users/google-uid-12345'])
    expect(commits).toEqual([
      [
        'users/google-uid-12345',
        'usernames/adalovelace',
        'userSettings/google-uid-12345',
        ...INSTRUMENTS.map((instrument) => `users/google-uid-12345/skillRatings/${instrument}`),
      ],
    ])
    expect(store.get('users/google-uid-12345')).toMatchObject({
      uid: 'google-uid-12345',
      username: 'AdaLovelace',
      displayName: 'Ada Lovelace',
      role: 'user',
    })
  })

  it('reuses the existing entry on a later sign-in instead of duplicating it', async () => {
    popupReturns(googleUser())

    await signInWithGoogle()
    const first = store.get('users/google-uid-12345')
    await signInWithGoogle()

    expect(userDocs()).toHaveLength(1)
    expect(commits).toHaveLength(1)
    expect(store.get('users/google-uid-12345')).toBe(first)
  })
})

describe('ensureAccountDocuments', () => {
  it('reports whether it created the entry', async () => {
    await expect(ensureAccountDocuments(googleUser())).resolves.toBe(true)
    await expect(ensureAccountDocuments(googleUser())).resolves.toBe(false)
  })

  it('leaves an existing profile untouched, even an admin one', async () => {
    const existing = { uid: 'google-uid-12345', role: 'admin', username: 'ada' }
    store.set('users/google-uid-12345', existing)

    await ensureAccountDocuments(googleUser())

    expect(store.get('users/google-uid-12345')).toBe(existing)
    expect(commits).toHaveLength(0)
  })

  it('suffixes the username with the uid when the natural one is taken', async () => {
    store.set('usernames/adalovelace', { uid: 'someone-else' })

    await ensureAccountDocuments(googleUser())

    expect(store.get('users/google-uid-12345')).toMatchObject({ username: 'AdaLovelace_googl' })
    expect(store.has('usernames/adalovelace_googl')).toBe(true)
  })

  it('falls back to the email, then a placeholder, for the username', async () => {
    await ensureAccountDocuments(googleUser({ uid: 'u-email', displayName: null }))
    await ensureAccountDocuments(googleUser({ uid: 'u-none', displayName: null, email: null }))

    expect(store.get('users/u-email')).toMatchObject({ username: 'adalovelace' })
    expect(store.get('users/u-none')).toMatchObject({ username: 'player' })
  })
})

describe('signOutCurrentUser', () => {
  it('ends the Firebase session', async () => {
    await signOutCurrentUser()

    expect(signOut).toHaveBeenCalledWith(auth)
  })
})
