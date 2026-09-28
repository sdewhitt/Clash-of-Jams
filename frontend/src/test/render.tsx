/**
 * Render helpers for component tests.
 *
 * Pages read the session through useAuth, so tests supply an AuthContext value
 * directly instead of mounting AuthProvider (which subscribes to Firebase).
 */
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { User } from 'firebase/auth'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'

import { AuthContext } from '@/lib/auth/context'
import type { AuthState } from '@/lib/auth/context'
import type { UserProfile } from '@/lib/schema/types'

export const SIGNED_OUT: AuthState = { user: null, profile: null, loading: false }

export function signedIn(overrides: Partial<UserProfile> = {}): AuthState {
  const uid = overrides.uid ?? 'user-1'
  return {
    user: { uid, email: `${uid}@example.com` } as User,
    profile: {
      uid,
      username: 'player_one',
      usernameLower: 'player_one',
      displayName: 'Player One',
      avatarUrl: null,
      bio: '',
      role: 'user',
      isBanned: false,
      isSocialRestricted: false,
      isProfilePublic: true,
      ...overrides,
    } as UserProfile,
    loading: false,
  }
}

/** Prints the current path so a test can assert where navigation landed. */
export function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

export function renderWithAuth(
  ui: ReactElement,
  { auth = SIGNED_OUT, route = '/' }: { auth?: AuthState; route?: string } = {},
) {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  )
}

/** Mounts `element` at `path` beside a catch-all that reports the location. */
export function renderAtRoute(
  element: ReactElement,
  { path, route = path, auth = SIGNED_OUT }: { path: string; route?: string; auth?: AuthState },
) {
  return renderWithAuth(
    <Routes>
      <Route path={path} element={element} />
      <Route path="*" element={<LocationProbe />} />
    </Routes>,
    { auth, route },
  )
}
