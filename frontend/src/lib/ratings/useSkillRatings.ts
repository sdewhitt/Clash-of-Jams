import { useEffect, useState } from 'react'
import { collection, doc, onSnapshot } from 'firebase/firestore'

import { db } from '@/lib/firebase'
import { COLLECTIONS, skillRatingsPath } from '@/lib/schema/collections'
import { INSTRUMENTS, type Instrument, type SkillRating } from '@/lib/schema/types'

interface RatingsEntry {
  uid: string
  ratings: SkillRating[]
  error: string | null
}

/** Ratings stay separate from auth identity and update without a reload. */
export function useSkillRatings(uid: string | undefined) {
  const [entry, setEntry] = useState<RatingsEntry | null>(null)
  const [preference, setPreference] = useState<{ uid: string; instrument: Instrument } | null>(null)

  useEffect(() => {
    if (!uid) return
    const unsubscribeRatings = onSnapshot(
      collection(db, skillRatingsPath(uid)),
      (snapshot) => {
        const ratings = snapshot.docs
          .map((document) => document.data() as SkillRating)
          .filter((rating) => rating.uid === uid && INSTRUMENTS.includes(rating.instrument))
          .sort((a, b) => INSTRUMENTS.indexOf(a.instrument) - INSTRUMENTS.indexOf(b.instrument))
        setEntry({ uid, ratings, error: null })
      },
      () => setEntry({ uid, ratings: [], error: 'Could not load your ratings.' }),
    )
    const unsubscribeSettings = onSnapshot(
      doc(db, COLLECTIONS.userSettings, uid),
      (snapshot) => {
        const instrument = snapshot.data()?.preferredInstrument
        setPreference({
          uid,
          instrument: INSTRUMENTS.includes(instrument) ? instrument : 'piano',
        })
      },
      () => setPreference({ uid, instrument: 'piano' }),
    )
    return () => {
      unsubscribeRatings()
      unsubscribeSettings()
    }
  }, [uid])

  const current = uid && entry?.uid === uid ? entry : null
  return {
    ratings: current?.ratings ?? [],
    loading: !!uid && current === null,
    error: current?.error ?? null,
    preferredInstrument:
      preference && preference.uid === uid ? preference.instrument : ('piano' as Instrument),
  }
}
