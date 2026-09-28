/** Reads the auth context; throws if used outside <AuthProvider>. */
import { useContext } from 'react'

import { AuthContext } from '@/lib/auth/context'
import type { AuthState } from '@/lib/auth/context'

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (value === null) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return value
}
