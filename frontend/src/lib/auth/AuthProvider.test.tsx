/**
 * User story #67: the session the rest of the app reads through useAuth.
 *
 * onAuthStateChanged is captured so each test can play Firebase's part and
 * announce a sign-in or sign-out.
 */
import { act, render, screen } from '@testing-library/react'
import type { User } from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let announce: (user: User | null) => void = () => {}

vi.mock('firebase/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/auth')>()),
  onAuthStateChanged: vi.fn((_auth: unknown, callback: (user: User | null) => void) => {
    announce = callback
    return () => {}
  }),
}))

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  onSnapshot: vi.fn(
    (_ref: unknown, next: (snapshot: { exists: () => boolean; data: () => unknown }) => void) => {
      next({ exists: () => true, data: () => ({ displayName: 'Ada', role: 'user' }) })
      return () => {}
    },
  ),
}))

const { AuthProvider } = await import('@/lib/auth/AuthProvider')
const { useAuth } = await import('@/lib/auth/useAuth')

function SessionProbe() {
  const { user, profile, loading } = useAuth()
  if (loading) return <p>loading</p>
  return <p>{user ? `signed in as ${user.uid} (${profile?.displayName})` : 'signed out'}</p>
}

beforeEach(() => {
  announce = () => {}
})

describe('AuthProvider', () => {
  it('reports loading until Firebase settles the session', () => {
    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    )

    expect(screen.getByText('loading')).toBeInTheDocument()
  })

  it('publishes the signed-in user and their profile', () => {
    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    )

    act(() => announce({ uid: 'ada-uid' } as User))

    expect(screen.getByText('signed in as ada-uid (Ada)')).toBeInTheDocument()
  })

  it('clears the session and profile on sign-out', () => {
    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    )

    act(() => announce({ uid: 'ada-uid' } as User))
    act(() => announce(null))

    expect(screen.getByText('signed out')).toBeInTheDocument()
  })

  it('throws when useAuth is used outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<SessionProbe />)).toThrow('useAuth must be used inside <AuthProvider>')
  })
})
