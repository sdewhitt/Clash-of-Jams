/** Reads and writes the one gameplay setting that persists so far: calibrated input latency. */
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

import { db } from '@/lib/firebase'
import { COLLECTIONS, newUserSettings } from '@/lib/schema/collections'

export async function loadInputLatencyMs(uid: string): Promise<number> {
  const snapshot = await getDoc(doc(db, COLLECTIONS.userSettings, uid))
  const value = snapshot.exists() ? snapshot.data().inputLatencyOffsetMs : 0
  return typeof value === 'number' ? value : 0
}

export async function saveInputLatencyMs(uid: string, latencyMs: number): Promise<void> {
  const ref = doc(db, COLLECTIONS.userSettings, uid)
  const snapshot = await getDoc(ref)
  if (snapshot.exists()) {
    await updateDoc(ref, { inputLatencyOffsetMs: latencyMs, updatedAt: serverTimestamp() })
  } else {
    // Accounts normally get this document at sign-up; write a whole one rather than a fragment.
    await setDoc(ref, { ...newUserSettings({ uid }), inputLatencyOffsetMs: latencyMs })
  }
}
