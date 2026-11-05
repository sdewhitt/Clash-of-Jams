/** The opponent's public profile, for the end-of-match screen. */
import { doc, getDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'

import { db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/schema/collections'
import type { UserProfile } from '@/lib/schema/types'

export type OpponentProfile = Pick<
  UserProfile,
  'uid' | 'username' | 'displayName' | 'avatarUrl' | 'bio'
>

/** Null when the profile is private or cannot be read; the screen falls back to the session name. */
export async function loadOpponentProfile(uid: string): Promise<OpponentProfile | null> {
  try {
    const snapshot = await getDoc(doc(db, COLLECTIONS.users, uid))
    if (!snapshot.exists()) return null
    const data = snapshot.data() as Partial<UserProfile>
    return {
      uid,
      username: data.username ?? '',
      displayName: data.displayName ?? data.username ?? '',
      avatarUrl: data.avatarUrl ?? null,
      bio: data.bio ?? '',
    }
  } catch {
    // Private profiles are unreadable by design (firestore.rules).
    return null
  }
}

export function useOpponentProfile(uid: string | undefined) {
  const [loaded, setLoaded] = useState<{ uid: string; profile: OpponentProfile | null } | null>(
    null,
  )
  useEffect(() => {
    if (!uid) return
    let cancelled = false
    void loadOpponentProfile(uid).then((profile) => {
      if (!cancelled) setLoaded({ uid, profile })
    })
    return () => {
      cancelled = true
    }
  }, [uid])
  const current = loaded?.uid === uid ? loaded : null
  return { profile: current?.profile ?? null, loading: Boolean(uid) && !current }
}
