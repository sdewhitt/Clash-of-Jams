import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore'
import { describe, it } from 'vitest'

import {
  newSkillRating,
  ratingHistoryPath,
  skillRatingsPath,
} from '../../src/lib/schema/collections.js'
import { ALICE, BOB, as, assertFails, assertSucceeds, seed, setupRulesEnv } from './env.js'

const env = setupRulesEnv()
const ratingPath = skillRatingsPath(ALICE) + '/piano'
const historyPath = ratingHistoryPath(ALICE, 'piano')
const history = {
  matchId: 'match-1',
  uid: ALICE,
  opponentUid: BOB,
  instrument: 'piano',
  eloBefore: 400,
  eloAfter: 416,
  eloDelta: 16,
  appliedAt: Timestamp.now(),
}

describe('Elo ownership and immutable history', () => {
  it('allows starting ratings but denies manufactured or modified Elo', async () => {
    const db = as(env(), ALICE)
    const initial = newSkillRating({ uid: ALICE, instrument: 'piano' })
    await assertFails(setDoc(doc(db, ratingPath), { ...initial, elo: 2000 }))
    await assertSucceeds(setDoc(doc(db, ratingPath), initial))
    await assertFails(updateDoc(doc(db, ratingPath), { elo: 2000 }))
    await assertFails(deleteDoc(doc(db, ratingPath)))
  })

  it('allows the owner to query server-written history in date order', async () => {
    await seed(env(), [[historyPath + '/match-1', history]])
    const db = as(env(), ALICE)
    await assertSucceeds(getDoc(doc(db, historyPath + '/match-1')))
    await assertSucceeds(
      getDocs(query(collection(db, historyPath), orderBy('appliedAt', 'desc'), limit(20))),
    )
  })

  it('denies another player and unauthenticated history reads', async () => {
    await seed(env(), [[historyPath + '/match-1', history]])
    for (const uid of [BOB, null]) {
      await assertFails(getDoc(doc(as(env(), uid), historyPath + '/match-1')))
      await assertFails(getDocs(collection(as(env(), uid), historyPath)))
    }
  })

  it('denies creating, rewriting, or deleting rating history, including by its owner', async () => {
    const db = as(env(), ALICE)
    await assertFails(setDoc(doc(db, historyPath + '/match-1'), history))
    await seed(env(), [[historyPath + '/match-1', history]])
    await assertFails(updateDoc(doc(db, historyPath + '/match-1'), { eloAfter: 9999 }))
    await assertFails(deleteDoc(doc(db, historyPath + '/match-1')))
  })
})
