/**
 * Reads and writes the calibrated latencies: the audio loop's (microphone and instrument) and
 * a MIDI controller's, which is calibrated separately because it is a fraction of the other.
 */
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

import { db } from '@/lib/firebase'
import { COLLECTIONS, newUserSettings } from '@/lib/schema/collections'

type LatencyField = 'inputLatencyOffsetMs' | 'midiLatencyOffsetMs'

export function loadInputLatencyMs(uid: string): Promise<number> {
  return loadLatency(uid, 'inputLatencyOffsetMs')
}

export function saveInputLatencyMs(uid: string, latencyMs: number): Promise<void> {
  return saveLatency(uid, 'inputLatencyOffsetMs', latencyMs)
}

export function loadMidiLatencyMs(uid: string): Promise<number> {
  return loadLatency(uid, 'midiLatencyOffsetMs')
}

export function saveMidiLatencyMs(uid: string, latencyMs: number): Promise<void> {
  return saveLatency(uid, 'midiLatencyOffsetMs', latencyMs)
}

async function loadLatency(uid: string, field: LatencyField): Promise<number> {
  const snapshot = await getDoc(doc(db, COLLECTIONS.userSettings, uid))
  const value = snapshot.exists() ? snapshot.data()[field] : 0
  return typeof value === 'number' ? value : 0
}

async function saveLatency(uid: string, field: LatencyField, latencyMs: number): Promise<void> {
  const ref = doc(db, COLLECTIONS.userSettings, uid)
  const snapshot = await getDoc(ref)
  if (snapshot.exists()) {
    await updateDoc(ref, { [field]: latencyMs, updatedAt: serverTimestamp() })
  } else {
    // Accounts normally get this document at sign-up; write a whole one rather than a fragment.
    await setDoc(ref, { ...newUserSettings({ uid }), [field]: latencyMs })
  }
}
