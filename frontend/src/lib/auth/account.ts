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
  newScenarioTheme,
  newSkillRating,
  newUserProfile,
  newUserSettings,
  newUsernameReservation,
  scenarioThemesPath,
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

  batch.set(doc(db, scenarioThemesPath(uid), "Purdue_Pete"), newScenarioTheme({ uid, themeName: "Purdue_Pete", themeUrl: "data:image/jpeg;base64,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" }))
  
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
