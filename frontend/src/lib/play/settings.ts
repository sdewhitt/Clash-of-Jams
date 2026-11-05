/**
 * Reads and writes the gameplay settings that persist: the calibrated latencies (the audio
 * loop's, and a MIDI controller's, which is calibrated separately because it is a fraction of the
 * other), and the audio interface and input the player plays through.
 */
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

import { DEFAULT_INPUT_CHOICE, type AudioInputChoice } from '@/audio/devices'
import { db } from '@/lib/firebase'
import { COLLECTIONS, newUserSettings } from '@/lib/schema/collections'
import type { UserSettings } from '@/lib/schema/types'

type LatencyField = 'inputLatencyOffsetMs' | 'midiLatencyOffsetMs'

type GameplaySettings = Partial<
  Pick<
    UserSettings,
    LatencyField | 'audioInputDeviceId' | 'audioInputDeviceLabel' | 'audioInputChannel'
  >
>

async function updateSettings(uid: string, fields: GameplaySettings): Promise<void> {
  const ref = doc(db, COLLECTIONS.userSettings, uid)
  const snapshot = await getDoc(ref)
  if (snapshot.exists()) {
    await updateDoc(ref, { ...fields, updatedAt: serverTimestamp() })
  } else {
    // Accounts normally get this document at sign-up; write a whole one rather than a fragment.
    await setDoc(ref, { ...newUserSettings({ uid }), ...fields })
  }
}

export function loadInputLatencyMs(uid: string): Promise<number> {
  return loadLatency(uid, 'inputLatencyOffsetMs')
}

export function saveInputLatencyMs(uid: string, latencyMs: number): Promise<void> {
  return updateSettings(uid, { inputLatencyOffsetMs: latencyMs })
}

export function loadMidiLatencyMs(uid: string): Promise<number> {
  return loadLatency(uid, 'midiLatencyOffsetMs')
}

export function saveMidiLatencyMs(uid: string, latencyMs: number): Promise<void> {
  return updateSettings(uid, { midiLatencyOffsetMs: latencyMs })
}

async function loadLatency(uid: string, field: LatencyField): Promise<number> {
  const snapshot = await getDoc(doc(db, COLLECTIONS.userSettings, uid))
  const value = snapshot.exists() ? snapshot.data()[field] : 0
  return typeof value === 'number' ? value : 0
}

/** The saved input choice from a settings document, with defaults for missing or bad fields. */
export function audioInputChoiceFrom(
  settings: Partial<UserSettings> | null | undefined,
): AudioInputChoice {
  if (!settings) return DEFAULT_INPUT_CHOICE
  const { audioInputDeviceId, audioInputDeviceLabel, audioInputChannel } = settings
  return {
    deviceId:
      typeof audioInputDeviceId === 'string' && audioInputDeviceId ? audioInputDeviceId : null,
    deviceLabel: typeof audioInputDeviceLabel === 'string' ? audioInputDeviceLabel : null,
    channel:
      typeof audioInputChannel === 'number' &&
      Number.isInteger(audioInputChannel) &&
      audioInputChannel >= 0
        ? audioInputChannel
        : null,
  }
}

export async function loadAudioInputChoice(uid: string): Promise<AudioInputChoice> {
  const snapshot = await getDoc(doc(db, COLLECTIONS.userSettings, uid))
  return audioInputChoiceFrom(snapshot.exists() ? (snapshot.data() as Partial<UserSettings>) : null)
}

export async function saveAudioInputChoice(uid: string, choice: AudioInputChoice): Promise<void> {
  await updateSettings(uid, {
    audioInputDeviceId: choice.deviceId,
    audioInputDeviceLabel: choice.deviceLabel,
    audioInputChannel: choice.channel,
  })
}
