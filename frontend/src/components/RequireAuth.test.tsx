/**
 * User story #67: route guards for signed-in and admin-only pages.
 */
import { screen } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'

import { RequireAdmin } from '@/components/RequireAdmin'
import { RequireAuth } from '@/components/RequireAuth'
import { isAdmin } from '@/lib/auth/roles'
import { renderWithAuth, SIGNED_OUT, signedIn } from '@/test/render'

function LoginProbe() {
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  return <p>login page, from {from}</p>
}

function guarded(element: React.ReactElement, path = '/protected') {
  return (
    <Routes>
      <Route path={path} element={element} />
      <Route path="/login" element={<LoginProbe />} />
      <Route path="/home" element={<p>home page</p>} />
    </Routes>
  )
}

describe('RequireAuth', () => {
  it('rejects a visitor with no session, remembering where they were going', () => {
    renderWithAuth(guarded(<RequireAuth>secret</RequireAuth>), {
      auth: SIGNED_OUT,
      route: '/protected',
    })

    expect(screen.getByText('login page, from /protected')).toBeInTheDocument()
    expect(screen.queryByText('secret')).not.toBeInTheDocument()
  })

  it('renders the page for a signed-in user', () => {
    renderWithAuth(guarded(<RequireAuth>secret</RequireAuth>), {
      auth: signedIn(),
      route: '/protected',
    })

    expect(screen.getByText('secret')).toBeInTheDocument()
  })

  it('renders nothing while the session is still being restored', () => {
    const { container } = renderWithAuth(guarded(<RequireAuth>secret</RequireAuth>), {
      auth: { ...SIGNED_OUT, loading: true },
      route: '/protected',
    })

    expect(container).toBeEmptyDOMElement()
  })
})

describe('isAdmin', () => {
  it('resolves admin and moderator accounts as admins and standard ones not', () => {
    expect(isAdmin(signedIn({ role: 'admin' }).profile)).toBe(true)
    expect(isAdmin(signedIn({ role: 'moderator' }).profile)).toBe(true)
    expect(isAdmin(signedIn({ role: 'user' }).profile)).toBe(false)
    expect(isAdmin(null)).toBe(false)
  })
})

describe('RequireAdmin', () => {
  const adminPage = (
    <RequireAuth>
      <RequireAdmin>admin tools</RequireAdmin>
    </RequireAuth>
  )

  it('admits an admin account', () => {
    renderWithAuth(guarded(adminPage), { auth: signedIn({ role: 'admin' }), route: '/protected' })

    expect(screen.getByText('admin tools')).toBeInTheDocument()
  })

  it('sends a standard account home without rendering the page', () => {
    renderWithAuth(guarded(adminPage), { auth: signedIn({ role: 'user' }), route: '/protected' })

    expect(screen.getByText('home page')).toBeInTheDocument()
    expect(screen.queryByText('admin tools')).not.toBeInTheDocument()
  })

  it('sends a signed-out visitor to sign-in', () => {
    renderWithAuth(guarded(adminPage), { auth: SIGNED_OUT, route: '/protected' })

    expect(screen.getByText('login page, from /protected')).toBeInTheDocument()
  })

  it('waits for the profile rather than bouncing an admin early', () => {
    const { user } = signedIn({ role: 'admin' })
    renderWithAuth(guarded(adminPage), {
      auth: { user, profile: null, loading: false },
      route: '/protected',
    })

    expect(screen.queryByText('home page')).not.toBeInTheDocument()
    expect(screen.queryByText('admin tools')).not.toBeInTheDocument()
  })
})
