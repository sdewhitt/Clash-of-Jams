/**
 * User story #67, the database side: what the rules let a signed-in account
 * do with its own entry, and where the admin/standard line is enforced.
 */
import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'

import {
  COLLECTIONS,
  newModerationAction,
  newUserSettings,
  newUsernameReservation,
  usernameKey,
} from '../../src/lib/schema/collections.ts'
import {
  ALICE,
  aliceProfile,
  as,
  assertFails,
  assertSucceeds,
  BOB,
  path,
  scenarioDoc,
  seed,
  setupRulesEnv,
} from './env.ts'

const env = setupRulesEnv()

const ADMIN = 'admin-uid'
const adminProfile = () => ({
  ...aliceProfile({ uid: ADMIN, username: 'Admin', usernameLower: 'admin' }),
  role: 'admin',
})

function firstSignInBatch(uid: string, username: string) {
  const db = as(env(), uid)
  const batch = writeBatch(db)
  batch.set(
    doc(db, path.user(uid)),
    aliceProfile({ uid, username, usernameLower: usernameKey(username) }),
  )
  batch.set(
    doc(db, `${COLLECTIONS.usernames}/${usernameKey(username)}`),
    newUsernameReservation({ uid, username }),
  )
  batch.set(doc(db, path.settings(uid)), newUserSettings({ uid }))
  return batch
}

describe('first sign-in', () => {
  it('may create exactly the account documents keyed to the caller uid', async () => {
    await assertSucceeds(firstSignInBatch(ALICE, 'Alice').commit())

    const snapshot = await getDoc(doc(as(env(), ALICE), path.user(ALICE)))
    expect(snapshot.id).toBe(ALICE)
    expect(snapshot.get('role')).toBe('user')
  })

  it('can read its own not-yet-created profile, to decide whether to create it', async () => {
    const snapshot = await assertSucceeds(getDoc(doc(as(env(), ALICE), path.user(ALICE))))
    expect(snapshot.exists()).toBe(false)
  })

  it('is rejected when the username is already held by someone else', async () => {
    await assertSucceeds(firstSignInBatch(ALICE, 'Alice').commit())

    // The whole batch fails, so Bob is not left with a half-created account.
    await assertFails(firstSignInBatch(BOB, 'alice').commit())
    expect((await getDoc(doc(as(env(), BOB), path.settings(BOB)))).exists()).toBe(false)
  })
})

describe('roles', () => {
  it('a new account cannot sign itself up as an admin', async () => {
    const db = as(env(), ALICE)
    await assertFails(setDoc(doc(db, path.user(ALICE)), aliceProfile({ role: 'admin' })))
    await assertFails(setDoc(doc(db, path.user(ALICE)), aliceProfile({ role: 'moderator' })))
  })

  it('a standard account cannot promote itself or lift its own restrictions', async () => {
    await seed(env(), [[path.user(ALICE), aliceProfile({ isSocialRestricted: true })]])
    const db = as(env(), ALICE)

    await assertFails(updateDoc(doc(db, path.user(ALICE)), { role: 'admin' }))
    await assertFails(updateDoc(doc(db, path.user(ALICE)), { isSocialRestricted: false }))
    await assertSucceeds(updateDoc(doc(db, path.user(ALICE)), { bio: 'Still allowed' }))
  })

  it('an admin may change another account role and moderation flags', async () => {
    await seed(env(), [
      [path.user(ADMIN), adminProfile()],
      [path.user(ALICE), aliceProfile()],
    ])
    const db = as(env(), ADMIN)

    await assertSucceeds(updateDoc(doc(db, path.user(ALICE)), { isBanned: true }))
    await assertSucceeds(updateDoc(doc(db, path.user(ALICE)), { role: 'moderator' }))
  })

  it('a standard user is denied admin-only operations', async () => {
    await seed(env(), [
      [path.user(ALICE), aliceProfile()],
      [path.user(BOB), aliceProfile({ uid: BOB, username: 'Bob', usernameLower: 'bob' })],
      [path.scenario('bobs'), scenarioDoc('bobs', BOB, { visibility: 'private' })],
    ])
    const db = as(env(), ALICE)

    const action = newModerationAction({
      id: 'act-1',
      moderatorUid: ALICE,
      targetType: 'user',
      targetId: BOB,
      action: 'ban',
    })
    await assertFails(setDoc(doc(db, `${COLLECTIONS.moderationActions}/act-1`), action))
    await assertFails(updateDoc(doc(db, path.user(BOB)), { isBanned: true }))
    await assertFails(getDoc(doc(db, path.scenario('bobs'))))
    await assertFails(getDoc(doc(db, `${COLLECTIONS.moderationActions}/act-1`)))
  })

  it('an admin is allowed the same operations', async () => {
    await seed(env(), [
      [path.user(ADMIN), adminProfile()],
      [path.scenario('bobs'), scenarioDoc('bobs', BOB, { visibility: 'private' })],
    ])
    const db = as(env(), ADMIN)

    const action = newModerationAction({
      id: 'act-1',
      moderatorUid: ADMIN,
      targetType: 'user',
      targetId: BOB,
      action: 'ban',
    })
    await assertSucceeds(setDoc(doc(db, `${COLLECTIONS.moderationActions}/act-1`), action))
    await assertSucceeds(getDoc(doc(db, path.scenario('bobs'))))
  })
})
