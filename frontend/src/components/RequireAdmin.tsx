/**
 * Route guard for admin-only pages. Nest it inside RequireAuth: signed-out
 * callers are RequireAuth's job, this one sends standard accounts home.
 */
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'

import { isAdmin } from '@/lib/auth/roles'
import { useAuth } from '@/lib/auth/useAuth'

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth()

  // The profile arrives after the session; wait for it rather than bouncing an
  // admin whose role has not loaded yet.
  if (loading || (user !== null && profile === null)) return null

  if (!isAdmin(profile)) return <Navigate to="/home" replace />

  return <>{children}</>
}
