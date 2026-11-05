import { EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup } from 'firebase/auth'
import type { User } from 'firebase/auth'

import { apiFetch } from '@/lib/api'

export interface AccountDeletionState {
  state: 'active' | 'pending_deletion' | 'purging' | 'purged'
  purgeAt?: { toDate(): Date }
  authAfter?: number
}

export async function requestAccountDeletion(user: User, password: string) {
  if (user.providerData.some(({ providerId }) => providerId === 'password') && user.email) {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password))
  } else {
    await reauthenticateWithPopup(user, new GoogleAuthProvider())
  }
  await user.getIdToken(true)
  return apiFetch<{ purgeAt: string }>('/account', { method: 'DELETE' })
}

export function restoreAccount() {
  return apiFetch<void>('/account/restore', { method: 'POST' })
}
