import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'

import { db } from '@/lib/firebase'
import { COLLECTIONS } from '@/lib/schema/collections'
import type { ProfileAppearance, PublicProfile } from '@/lib/schema/types'

export const PROFILE_ACCENTS = {
  Default: 'var(--color-accent-end)',
  Blue: '#60a5fa',
  Green: '#4ade80',
  Violet: '#c084fc',
} as const

export const DEFAULT_APPEARANCE: ProfileAppearance = { accent: 'Default', featuredScores: [] }

export function publicAppearance(appearance: ProfileAppearance, publicHistory: boolean) {
  return {
    accent: appearance.accent,
    featuredScores: publicHistory ? appearance.featuredScores : [],
  }
}

export async function saveProfileAppearance(uid: string, appearance: ProfileAppearance) {
  const settingsRef = doc(db, COLLECTIONS.userSettings, uid)
  const profileRef = doc(db, COLLECTIONS.publicProfile, uid)

  const profile = await getDoc(profileRef)

  // Atomic like a transaction, but a batch also updates local listeners straight away,
  // so the header shows the new accent as soon as it is saved.
  const batch = writeBatch(db)
  batch.set(settingsRef, { profileAppearance: appearance }, { merge: true })

  if (profile.exists()) {
    const { publicHistory } = profile.data() as PublicProfile
    batch.update(profileRef, {
      profileAppearance: publicAppearance(appearance, publicHistory === true),
      updatedAt: serverTimestamp(),
    })
  }

  await batch.commit()
}

export async function publishedScenarioTitles(scenarioIds: string[]) {
  const titles = await Promise.all([...new Set(scenarioIds)].map(async (id) => {
    try {
      const scenario = (await getDoc(doc(db, COLLECTIONS.scenarios, id))).data()
      if (scenario?.visibility === 'public' && typeof scenario.title === 'string') {
        return [id, scenario.title] as const
      }
    } catch {
      // The scenario may have been made private since the score was selected.
    }
    return null
  }))

  return new Map(titles.filter((entry) => entry !== null))
}
