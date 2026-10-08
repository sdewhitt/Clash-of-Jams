import { useState } from 'react'

import { updatePreferredInstrument } from '@/lib/profile/UserProfile'
import type { Instrument } from '@/lib/schema/types'

/** Reuse the account preference used by profiles and matchmaking. */
export function useInstrumentPreference(uid: string | undefined, preferred: Instrument) {
  const [pending, setPending] = useState<{ uid: string; instrument: Instrument } | null>(null)
  const [failure, setFailure] = useState<{ uid: string; message: string } | null>(null)
  const owned = pending?.uid === uid ? pending : null

  async function selectInstrument(instrument: Instrument) {
    if (!uid || owned) return
    setPending({ uid, instrument })
    setFailure(null)
    try {
      await updatePreferredInstrument(uid, instrument)
    } catch {
      setFailure({ uid, message: 'Could not save your instrument. Please try again.' })
    } finally {
      setPending((current) => (current?.uid === uid ? null : current))
    }
  }

  return {
    instrument: owned?.instrument ?? preferred,
    saving: owned !== null,
    saveError: failure && failure.uid === uid ? failure.message : null,
    selectInstrument,
  }
}
