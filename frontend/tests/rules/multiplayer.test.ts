import { deleteDoc, doc, getDoc, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { describe, it } from 'vitest'

import { ALICE, as, assertFails, assertSucceeds, BOB, seed, setupRulesEnv } from './env.ts'

const env = setupRulesEnv()
const match = 'matches/demo-match'
const participant = match + '/participants/' + ALICE

describe('server-owned multiplayer state', () => {
  it('lets both players read shared state but denies outsiders and signed-out reads', async () => {
    await seed(env(), [
      [match, { participantUids: [ALICE, BOB], state: 'in_progress' }],
      [participant, { uid: ALICE, isReady: true, finalScore: null }],
    ])
    for (const uid of [ALICE, BOB]) {
      await assertSucceeds(getDoc(doc(as(env(), uid), match)))
      await assertSucceeds(getDoc(doc(as(env(), uid), participant)))
    }
    for (const uid of ['outsider', null]) {
      await assertFails(getDoc(doc(as(env(), uid), match)))
      await assertFails(getDoc(doc(as(env(), uid), participant)))
    }
  })

  it('prevents a participant from forging readiness, score, membership or outcome', async () => {
    await seed(env(), [
      [match, { participantUids: [ALICE, BOB], state: 'lobby' }],
      [participant, { uid: ALICE, isReady: false, finalScore: null }],
    ])
    const db = as(env(), ALICE)
    await assertFails(updateDoc(doc(db, participant), { isReady: true, finalScore: 1 }))
    await assertFails(updateDoc(doc(db, match), { state: 'complete', winnerUid: ALICE }))
    await assertFails(deleteDoc(doc(db, match)))
    await assertFails(setDoc(doc(db, 'matches/forged'), { participantUids: [ALICE, BOB] }))
  })
})

describe('friendship consent for spectators', () => {
  it('requires the recipient to accept and create the friendship atomically', async () => {
    const sender = as(env(), ALICE)
    const recipient = as(env(), BOB)
    const key = ALICE + '_' + BOB
    const request = 'friendRequests/' + key
    const friendship = 'friendships/' + key
    const data = {
      id: key,
      uidA: ALICE,
      uidB: BOB,
      friends: [ALICE, BOB],
      uidAWins: 0,
      uidBWins: 0,
      totalFriendlies: 0,
      matchHistory: [],
      createdAt: Timestamp.now(),
    }
    await assertSucceeds(setDoc(doc(sender, request), {
      potentialFriends: [ALICE, BOB],
      initiatorUid: ALICE,
      status: 'pending',
      createdAt: Timestamp.now(),
    }))
    await assertFails(setDoc(doc(sender, friendship), data))
    await assertFails(updateDoc(doc(recipient, request), { status: 'accepted' }))

    function accept(db: typeof sender) {
      const batch = writeBatch(db)
      batch.update(doc(db, request), { status: 'accepted' })
      batch.set(doc(db, friendship), data)
      return batch.commit()
    }
    await assertFails(accept(sender))
    await assertSucceeds(accept(recipient))
  })
})
