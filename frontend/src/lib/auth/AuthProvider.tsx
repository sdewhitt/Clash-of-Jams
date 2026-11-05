/**
 * Publishes the signed-in user and their profile document to the whole tree.
 *
 * Firebase Auth supplies the session. Firestore keeps the profile and
 * deletion state current.
 */
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'

import type { AccountDeletionState } from '@/lib/auth/deletion'
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
  const [authLoading, setLoading] = useState(true)
  const [accountEntry, setAccountEntry] = useState<{ uid: string; account?: AccountDeletionState }>()

  useEffect(() => {
    return onAuthStateChanged(auth, (next) => {
      setUser(next)
      setLoading(false)
    })
  }, [])

  const account = accountEntry?.uid === user?.uid ? accountEntry?.account : undefined
  const blocked = account !== undefined && account.state !== 'active'
  const loading = authLoading || (user !== null && accountEntry?.uid !== user.uid)

  useEffect(() => {
    if (!user || blocked || loading) return
    const { uid } = user
    return onSnapshot(
      doc(db, COLLECTIONS.users, uid),
      (snapshot) =>
        setEntry({ uid, profile: snapshot.exists() ? (snapshot.data() as UserProfile) : null }),
      // A read can fail if rules reject it or the profile write never landed;
      // the app treats that the same as "no profile yet".
      () => setEntry({ uid, profile: null }),
    )
  }, [user, blocked, loading])

  useEffect(() => {
    if (!user) return
    const { uid } = user
    return onSnapshot(doc(db, 'accountDeletions', uid), (snapshot) => {
      setAccountEntry({ uid, account: snapshot.data() as AccountDeletionState | undefined })
    }, () => setAccountEntry({ uid }))
  }, [user])

  const profile = !blocked && user !== null && entry?.uid === user.uid ? entry.profile : null
  const value = useMemo(() => ({ user, profile, loading, account }), [user, profile, loading, account])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
