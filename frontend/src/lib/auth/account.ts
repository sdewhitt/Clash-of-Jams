/**
 * Account lifecycle: sign up, sign in, sign out, password reset.
 *
 * Credentials live in Firebase Auth. Signing up also writes the three
 * documents a new account needs — users/{uid}, usernames/{usernameLower} and
 * userSettings/{uid} — through the factories in schema/collections.ts, so the
 * uniqueness invariant on usernames is enforced by the document key.
 */
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, writeBatch } from 'firebase/firestore'

import { auth, db } from '@/lib/firebase'
import {
  COLLECTIONS,
  newUserProfile,
  newUserSettings,
  newUsernameReservation,
  usernameKey,
} from '@/lib/schema/collections'

/** Lowercased form is the reservation key, so the pattern is case-insensitive. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/

/** An error whose message is safe to render to the user as-is. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

/** True when nobody has reserved this username yet. */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const snapshot = await getDoc(doc(db, COLLECTIONS.usernames, usernameKey(username)))
  return !snapshot.exists()
}

export async function signUp(args: {
  email: string
  password: string
  username: string
  displayName?: string
}): Promise<User> {
  const { email, password, username } = args
  const displayName = args.displayName?.trim() || username

  if (!USERNAME_PATTERN.test(username)) {
    throw new AuthError('Usernames are 3-20 characters: letters, numbers and underscores.')
  }
  if (!(await isUsernameAvailable(username))) {
    throw new AuthError('That username is taken.')
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password)
  const { user } = credential

  try {
    // One batch so a lost race on the username key leaves nothing behind.
    const batch = writeBatch(db)
    batch.set(
      doc(db, COLLECTIONS.users, user.uid),
      newUserProfile({ uid: user.uid, username, displayName }),
    )
    batch.set(
      doc(db, COLLECTIONS.usernames, usernameKey(username)),
      newUsernameReservation({ uid: user.uid, username }),
    )
    batch.set(doc(db, COLLECTIONS.userSettings, user.uid), newUserSettings({ uid: user.uid }))
    await batch.commit()
  } catch (error) {
    // Roll the auth account back, otherwise the email is locked to a user with
    // no profile and the address cannot be reused.
    await deleteUser(user).catch(() => undefined)
    throw error
  }

  await updateProfile(user, { displayName })
  return user
}

export async function signIn(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  return credential.user
}

export function signOutCurrentUser(): Promise<void> {
  return signOut(auth)
}

export function sendResetEmail(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email)
}

/** Firebase error codes are not user-facing; this maps the ones a form can hit. */
const MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'An account already exists for that email.',
  'auth/invalid-email': 'That email address is not valid.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/weak-password': 'Passwords must be at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/network-request-failed': 'Could not reach Firebase. Check your connection.',
  'auth/operation-not-allowed': 'Email/password sign-in is not enabled for this project.',
  'permission-denied': 'Firestore rejected the write. Are the security rules deployed?',
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError) return error.message
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined
  if (code && MESSAGES[code]) return MESSAGES[code]
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}
