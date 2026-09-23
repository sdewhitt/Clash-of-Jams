/**
 * Publishes the signed-in user and their profile document to the whole tree.
 *
 * Two subscriptions: Firebase Auth for the session, and users/{uid} for the
 * profile, so a username or avatar change shows up without a reload.
 */
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

import { AuthContext } from '@/lib/auth/context'
import { auth, db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/schema/collections'
import type { UserProfile } from '@/lib/schema/types'

/** The uid travels with the profile so a stale one is never shown to the next user. */
interface ProfileEntry {
  uid: string
  profile: UserProfile | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [entry, setEntry] = useState<ProfileEntry | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, (next) => {
      setUser(next)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!user) return
    const { uid } = user
    return onSnapshot(
      doc(db, COLLECTIONS.users, uid),
      (snapshot) =>
        setEntry({ uid, profile: snapshot.exists() ? (snapshot.data() as UserProfile) : null }),
      // A read can fail if rules reject it or the profile write never landed;
      // the app treats that the same as "no profile yet".
      () => setEntry({ uid, profile: null }),
    )
  }, [user])

  const profile = user !== null && entry?.uid === user.uid ? entry.profile : null
  const value = useMemo(() => ({ user, profile, loading }), [user, profile, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
