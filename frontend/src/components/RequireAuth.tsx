/**
 * Route guard. Renders its children only for a signed-in caller; everyone else
 * is sent to /login with the attempted path so sign-in can return them there.
 */
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

import { useAuth } from '@/lib/auth/useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  // Blank rather than a spinner: restoring a session is near-instant, and a
  // flash of "loading" is worse than a frame of nothing.
  if (loading) return null

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
