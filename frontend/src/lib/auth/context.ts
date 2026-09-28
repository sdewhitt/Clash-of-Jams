/**
 * The auth context object, split from the provider so a fast-refresh edit to
 * one does not remount the other.
 */
import { createContext } from 'react'
import type { User } from 'firebase/auth'

import type { UserProfile } from '@/lib/schema/types'

export interface AuthState {
  /** The Firebase Auth user, or null when signed out. */
  user: User | null
  /** users/{uid}, kept live. Null while it loads or if it was never written. */
  profile: UserProfile | null
  /** True until the first onAuthStateChanged callback settles. */
  loading: boolean
}

export const AuthContext = createContext<AuthState | null>(null)
