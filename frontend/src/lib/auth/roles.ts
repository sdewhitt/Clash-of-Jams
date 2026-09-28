/**
 * Admin vs. standard accounts, as the client sees them.
 *
 * The role lives on users/{uid}. This mirrors isAdmin() in
 * firebase/firestore.rules, which is what actually enforces it: hiding a
 * control here is a courtesy, the rules are the boundary.
 */
import type { Role, UserProfile } from '@/lib/schema/types'

export const ADMIN_ROLES: readonly Role[] = ['admin', 'moderator']

export function isAdmin(profile: UserProfile | null): boolean {
  return profile !== null && ADMIN_ROLES.includes(profile.role)
}
