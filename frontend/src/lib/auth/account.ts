/**
 * Account lifecycle: sign up, sign in (email or Google), sign out, password reset.
 *
 * Credentials live in Firebase Auth. Signing up, or signing in with Google for
 * the first time, also writes the three documents a new account needs --
 * users/{uid}, usernames/{usernameLower} and userSettings/{uid} -- through the
 * factories in schema/collections.ts, so the uniqueness invariant on usernames
 * is enforced by the document key.
 */
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, getDoc, writeBatch } from 'firebase/firestore'

import { auth, db } from '@/lib/firebase'
import {
  COLLECTIONS,
  newSkillRating,
  newUserProfile,
  newUserSettings,
  newUsernameReservation,
  skillRatingsPath,
  usernameKey,
} from '@/lib/schema/collections'
import { INSTRUMENTS } from '@/lib/schema/types'

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
    await writeAccountDocuments({ uid: user.uid, username, displayName })
  } catch (error) {
    // Roll the auth account back, otherwise the email is locked to a user with
    // no profile and the address cannot be reused.
    await deleteUser(user).catch(() => undefined)
    throw error
  }

  await updateProfile(user, { displayName })
  return user
}

/** One batch so a lost race on the username key leaves nothing behind. */
async function writeAccountDocuments(args: { uid: string; username: string; displayName: string }) {
  const { uid, username, displayName } = args
  const batch = writeBatch(db)
  batch.set(doc(db, COLLECTIONS.users, uid), newUserProfile({ uid, username, displayName }))
  batch.set(
    doc(db, COLLECTIONS.usernames, usernameKey(username)),
    newUsernameReservation({ uid, username }),
  )
  batch.set(doc(db, COLLECTIONS.userSettings, uid), newUserSettings({ uid }))
  for (const instrument of INSTRUMENTS) {
    batch.set(doc(db, skillRatingsPath(uid), instrument), newSkillRating({ uid, instrument }))
  }
  await batch.commit()
}

/**
 * A username for an OAuth account, which arrives without one. Built from the
 * provider's display name or email; if that is taken, a uid suffix makes it
 * unique without a second round trip.
 */
async function usernameFor(user: User): Promise<string> {
  const source = user.displayName || user.email?.split('@')[0] || ''
  const cleaned = source.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 14)
  const base = cleaned.length >= 3 ? cleaned : 'player'
  if (await isUsernameAvailable(base)) return base
  return `${base}_${user.uid.slice(0, 5)}`
}

/**
 * Creates the account documents for a user who signed in through a provider,
 * the first time only. Returns true when it wrote them, false when users/{uid}
 * already existed, so a returning user is never duplicated or reset.
 */
export async function ensureAccountDocuments(user: User): Promise<boolean> {
  const profile = await getDoc(doc(db, COLLECTIONS.users, user.uid))
  if (profile.exists()) return false

  const username = await usernameFor(user)
  const displayName = user.displayName?.trim() || username
  await writeAccountDocuments({ uid: user.uid, username, displayName })
  return true
}

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth, new GoogleAuthProvider())
  await ensureAccountDocuments(credential.user)
  return credential.user
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
  'auth/operation-not-allowed': 'That sign-in method is not enabled for this project.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
  'auth/account-exists-with-different-credential':
    'An account already exists for that email with a different sign-in method.',
  'permission-denied': 'Firestore rejected the write. Are the security rules deployed?',
}

export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError) return error.message
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined
  if (code && MESSAGES[code]) return MESSAGES[code]
  return error instanceof Error ? error.message : 'Something went wrong. Try again.'
}
