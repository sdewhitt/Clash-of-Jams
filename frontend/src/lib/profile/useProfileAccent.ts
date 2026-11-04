import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'

import { db } from '@/lib/firebase'
import { PROFILE_ACCENTS } from '@/lib/profile/profileAppearance'
import { COLLECTIONS } from '@/lib/schema/collections'
import type { ProfileAppearance } from '@/lib/schema/types'

export function useProfileAccent(uid: string | undefined, ownProfile: boolean) {
  const collection = ownProfile ? COLLECTIONS.userSettings : COLLECTIONS.publicProfile
  const [entry, setEntry] = useState<{
    uid: string
    collection: typeof collection
    accent?: ProfileAppearance['accent']
  }>()

  useEffect(() => {
    if (!uid) return
    return onSnapshot(
      doc(db, collection, uid),
      (snapshot) => setEntry({ uid, collection, accent: snapshot.data()?.profileAppearance?.accent }),
      () => setEntry({ uid, collection }),
    )
  }, [collection, uid])

  if (!entry || entry.uid !== uid || entry.collection !== collection) return undefined
  const { accent } = entry
  return accent && accent !== 'Default' && Object.hasOwn(PROFILE_ACCENTS, accent)
    ? PROFILE_ACCENTS[accent]
    : undefined
}
