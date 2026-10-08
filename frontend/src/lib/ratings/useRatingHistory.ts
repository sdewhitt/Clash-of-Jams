import { useEffect, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'

import { db } from '@/lib/firebase'
import { ratingHistoryPath } from '@/lib/schema/collections'
import type { Instrument, RatingEvent } from '@/lib/schema/types'

export function useRatingHistory(uid: string | undefined, instrument: Instrument, enabled = true) {
  const [attempt, setAttempt] = useState(0)
  const [entry, setEntry] = useState<{
    key: string
    events: RatingEvent[]
    error: string | null
  } | null>(null)
  const key = uid && enabled ? uid + '/' + instrument + '/' + attempt : null

  useEffect(() => {
    if (!uid || !key) return
    let active = true
    const unsubscribe = onSnapshot(
      query(
        collection(db, ratingHistoryPath(uid, instrument)),
        orderBy('appliedAt', 'desc'),
        limit(20),
      ),
      (snapshot) => {
        if (!active) return
        setEntry({
          key,
          events: snapshot.docs.map((document) => document.data() as RatingEvent),
          error: null,
        })
      },
      (failure) => {
        if (!active) return
        console.warn('Rating history subscription failed:', failure?.code, failure?.message)
        setEntry({ key, events: [], error: 'Could not load your rating history.' })
      },
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [uid, instrument, key])

  const current = entry?.key === key ? entry : null
  return {
    events: current?.events ?? [],
    loading: key !== null && current === null,
    error: current?.error ?? null,
    retry: () => setAttempt((value) => value + 1),
  }
}
