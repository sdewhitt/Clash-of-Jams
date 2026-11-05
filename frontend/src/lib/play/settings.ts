/**
 * Reads and writes the gameplay settings that persist: calibrated input latency, and the audio
 * interface and input the player plays through.
 */
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

import { DEFAULT_INPUT_CHOICE, type AudioInputChoice } from '@/audio/devices'
import { db } from '@/lib/firebase'
import { COLLECTIONS, newUserSettings } from '@/lib/schema/collections'
import type { UserSettings } from '@/lib/schema/types'

type GameplaySettings = Partial<
  Pick<
    UserSettings,
    'inputLatencyOffsetMs' | 'audioInputDeviceId' | 'audioInputDeviceLabel' | 'audioInputChannel'
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

export async function loadInputLatencyMs(uid: string): Promise<number> {
  const snapshot = await getDoc(doc(db, COLLECTIONS.userSettings, uid))
  const value = snapshot.exists() ? snapshot.data().inputLatencyOffsetMs : 0
  return typeof value === 'number' ? value : 0
}

export async function saveInputLatencyMs(uid: string, latencyMs: number): Promise<void> {
  await updateSettings(uid, { inputLatencyOffsetMs: latencyMs })
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
