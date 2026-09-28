/**
 * User story #74: the Firestore database and its base schemas.
 *
 * Runs against the emulator with the real firebase/firestore.rules. Documents
 * are built with the factories in src/lib/schema/collections.ts, the same ones
 * the app writes through.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { describe, expect, it } from 'vitest'

import {
  COLLECTIONS,
  newUsernameReservation,
  scenarioReviewId,
  newScenarioReview,
  usernameKey,
} from '../../src/lib/schema/collections.ts'
import {
  ALICE,
  aliceProfile,
  aliceSettings,
  as,
  assertFails,
  assertSucceeds,
  BOB,
  path,
  runDoc,
  scaleChart,
  scenarioDoc,
  seed,
  setupRulesEnv,
  versionDoc,
  versionPath,
  without,
} from './env.ts'

const env = setupRulesEnv()

const anyTimestamp = expect.any(Timestamp)

describe('round trip through each base collection', () => {
  it('user data: profile and settings read back unchanged', async () => {
    const db = as(env(), ALICE)
    const profile = aliceProfile({ bio: 'Plays by ear' })
    const settings = aliceSettings()

    await assertSucceeds(setDoc(doc(db, path.user(ALICE)), profile))
    await assertSucceeds(setDoc(doc(db, path.settings(ALICE)), settings))

    const readProfile = (await getDoc(doc(db, path.user(ALICE)))).data()
    const readSettings = (await getDoc(doc(db, path.settings(ALICE)))).data()
    expect(readProfile).toEqual({ ...profile, createdAt: anyTimestamp, updatedAt: anyTimestamp })
    expect(readSettings).toEqual({ ...settings, updatedAt: anyTimestamp })
  })

  it('scenario data: metadata and the embedded note chart read back unchanged', async () => {
    const db = as(env(), ALICE)
    const scenario = scenarioDoc('scale', ALICE, { tags: ['warmup'], authorDifficulty: 3 })
    const version = versionDoc('scale', 'scale-v1')

    await assertSucceeds(setDoc(doc(db, path.scenario('scale')), scenario))
    await assertSucceeds(setDoc(doc(db, versionPath('scale', 'scale-v1')), version))

    const readScenario = (await getDoc(doc(db, path.scenario('scale')))).data()
    const readVersion = (await getDoc(doc(db, versionPath('scale', 'scale-v1')))).data()
    expect(readScenario).toEqual({ ...scenario, createdAt: anyTimestamp, updatedAt: anyTimestamp })
    expect(readVersion).toEqual({ ...version, createdAt: anyTimestamp })
    expect(readVersion?.chart).toEqual(scaleChart())
  })

  it('leaderboard entry: a submitted run reads back unchanged', async () => {
    const db = as(env(), ALICE)
    const run = runDoc('run-1', { finalScore: 912.5 })

    await assertSucceeds(setDoc(doc(db, path.run('run-1')), run))

    const read = (await getDoc(doc(db, path.run('run-1')))).data()
    expect(read).toEqual({ ...run, playedAt: anyTimestamp })
  })

  it('published song: a public scenario and its version are readable by another player', async () => {
    const author = as(env(), ALICE)
    const scenario = scenarioDoc('anthem', ALICE, { visibility: 'public' })
    const version = versionDoc('anthem', 'anthem-v1')

    // One batch, the way the editor saves a new scenario with its first version.
    const batch = writeBatch(author)
    batch.set(doc(author, path.scenario('anthem')), {
      ...scenario,
      currentVersionId: 'anthem-v1',
      currentVersionNumber: 1,
    })
    batch.set(doc(author, versionPath('anthem', 'anthem-v1')), version)
    await assertSucceeds(batch.commit())

    const player = as(env(), BOB)
    const readScenario = (await assertSucceeds(getDoc(doc(player, path.scenario('anthem'))))).data()
    const readVersion = (
      await assertSucceeds(getDoc(doc(player, versionPath('anthem', 'anthem-v1'))))
    ).data()
    expect(readScenario).toMatchObject({ title: 'C major scale', currentVersionId: 'anthem-v1' })
    expect(readVersion).toEqual({ ...version, createdAt: anyTimestamp })
  })
})

describe('writes missing a required field are rejected', () => {
  it.each(['username', 'role', 'isProfilePublic', 'createdAt'] as const)(
    'users without %s',
    async (field) => {
      const db = as(env(), ALICE)
      await assertFails(setDoc(doc(db, path.user(ALICE)), without(aliceProfile(), field)))
    },
  )

  it.each(['title', 'instrument', 'visibility', 'authorUid'] as const)(
    'scenarios without %s',
    async (field) => {
      const db = as(env(), ALICE)
      await assertFails(setDoc(doc(db, path.scenario('s1')), without(scenarioDoc('s1'), field)))
    },
  )

  it.each(['chart', 'versionNumber', 'scoringRules'] as const)(
    'versions without %s',
    async (field) => {
      await seed(env(), [[path.scenario('s1'), scenarioDoc('s1')]])
      const db = as(env(), ALICE)
      await assertFails(
        setDoc(doc(db, versionPath('s1', 'v1')), without(versionDoc('s1', 'v1'), field)),
      )
    },
  )

  it.each(['finalScore', 'scenarioVersionId', 'breakdown'] as const)(
    'runs without %s',
    async (field) => {
      const db = as(env(), ALICE)
      await assertFails(setDoc(doc(db, path.run('r1')), without(runDoc('r1', {}), field)))
    },
  )

  it('an update that deletes a required field', async () => {
    await seed(env(), [[path.scenario('s1'), scenarioDoc('s1')]])
    const db = as(env(), ALICE)
    const { deleteField } = await import('firebase/firestore')
    await assertFails(updateDoc(doc(db, path.scenario('s1')), { description: deleteField() }))
  })

  it('a document carrying a field the schema does not define', async () => {
    const db = as(env(), ALICE)
    await assertFails(setDoc(doc(db, path.scenario('s1')), { ...scenarioDoc('s1'), secret: 1 }))
  })
})

describe('writes with a wrongly typed field are rejected', () => {
  it('a run whose finalScore is a string', async () => {
    const db = as(env(), ALICE)
    await assertFails(setDoc(doc(db, path.run('r1')), { ...runDoc('r1', {}), finalScore: '999' }))
  })

  it('a scenario whose authorDifficulty is a string or out of range', async () => {
    const db = as(env(), ALICE)
    const ref = doc(db, path.scenario('s1'))
    await assertFails(setDoc(ref, scenarioDoc('s1', ALICE, { authorDifficulty: '5' })))
    await assertFails(setDoc(ref, scenarioDoc('s1', ALICE, { authorDifficulty: 11 })))
    await assertFails(setDoc(ref, scenarioDoc('s1', ALICE, { instrument: 'kazoo' })))
  })

  it('a profile whose isProfilePublic is a string', async () => {
    const db = as(env(), ALICE)
    await assertFails(setDoc(doc(db, path.user(ALICE)), aliceProfile({ isProfilePublic: 'yes' })))
  })

  it('a version whose chart is a string', async () => {
    await seed(env(), [[path.scenario('s1'), scenarioDoc('s1')]])
    const db = as(env(), ALICE)
    await assertFails(
      setDoc(doc(db, versionPath('s1', 'v1')), { ...versionDoc('s1', 'v1'), chart: 'C D E' }),
    )
  })

  it('an update that changes a field to the wrong type', async () => {
    await seed(env(), [[path.scenario('s1'), scenarioDoc('s1')]])
    const db = as(env(), ALICE)
    await assertFails(updateDoc(doc(db, path.scenario('s1')), { title: 42 }))
    await assertSucceeds(updateDoc(doc(db, path.scenario('s1')), { title: 'Renamed' }))
  })
})

describe('unique identifiers', () => {
  it('a username already reserved cannot be claimed again', async () => {
    const key = usernameKey('Alice')
    const alice = as(env(), ALICE)
    await assertSucceeds(
      setDoc(
        doc(alice, `${COLLECTIONS.usernames}/${key}`),
        newUsernameReservation({ uid: ALICE, username: 'Alice' }),
      ),
    )

    const bob = as(env(), BOB)
    await assertFails(
      setDoc(
        doc(bob, `${COLLECTIONS.usernames}/${usernameKey('ALICE')}`),
        newUsernameReservation({ uid: BOB, username: 'ALICE' }),
      ),
    )
    const reservation = await getDoc(doc(bob, `${COLLECTIONS.usernames}/${key}`))
    expect(reservation.data()?.uid).toBe(ALICE)
  })

  it('a user record cannot be created under another uid', async () => {
    const bob = as(env(), BOB)
    await assertFails(setDoc(doc(bob, path.user(ALICE)), aliceProfile({ uid: ALICE })))
  })

  it('a review must live at its {scenarioId}_{uid} key, one per player per scenario', async () => {
    const db = as(env(), ALICE)
    const review = newScenarioReview({ scenarioId: 'scale', reviewerUid: ALICE, rating: 4 })

    await assertFails(setDoc(doc(db, `${COLLECTIONS.scenarioReviews}/second-review`), review))
    await assertSucceeds(
      setDoc(doc(db, `${COLLECTIONS.scenarioReviews}/${scenarioReviewId('scale', ALICE)}`), review),
    )
  })
})

describe('access control', () => {
  it('an unauthenticated client can neither read nor write private user data', async () => {
    await seed(env(), [
      [path.user(ALICE), aliceProfile({ isProfilePublic: false })],
      [path.settings(ALICE), aliceSettings()],
    ])
    const guest = as(env(), null)

    await assertFails(getDoc(doc(guest, path.user(ALICE))))
    await assertFails(getDoc(doc(guest, path.settings(ALICE))))
    await assertFails(setDoc(doc(guest, path.settings(ALICE)), aliceSettings()))
    await assertFails(setDoc(doc(guest, path.user('guest')), aliceProfile({ uid: 'guest' })))
    await assertFails(getDocs(collection(guest, COLLECTIONS.userSettings)))
  })

  it('an unauthenticated client may read a profile its owner made public', async () => {
    await seed(env(), [[path.user(ALICE), aliceProfile({ isProfilePublic: true })]])
    await assertSucceeds(getDoc(doc(as(env(), null), path.user(ALICE))))
  })

  it("a signed-in user cannot read or write another user's private records", async () => {
    await seed(env(), [
      [path.user(ALICE), aliceProfile({ isProfilePublic: false })],
      [path.settings(ALICE), aliceSettings()],
      [path.scenario('secret'), scenarioDoc('secret', ALICE, { visibility: 'private' })],
    ])
    const bob = as(env(), BOB)

    await assertFails(getDoc(doc(bob, path.user(ALICE))))
    await assertFails(updateDoc(doc(bob, path.user(ALICE)), { bio: 'hacked' }))
    await assertFails(getDoc(doc(bob, path.settings(ALICE))))
    await assertFails(updateDoc(doc(bob, path.settings(ALICE)), { masterVolume: 0 }))
    await assertFails(getDoc(doc(bob, path.scenario('secret'))))
    await assertFails(updateDoc(doc(bob, path.scenario('secret')), { title: 'Mine now' }))
    await assertFails(deleteDoc(doc(bob, path.scenario('secret'))))
    await assertFails(
      setDoc(doc(bob, path.run('fake')), runDoc('fake', { userUid: ALICE, finalScore: 1 })),
    )
  })

  it('an owner can read and write their own private records', async () => {
    await seed(env(), [
      [path.user(ALICE), aliceProfile({ isProfilePublic: false })],
      [path.settings(ALICE), aliceSettings()],
    ])
    const alice = as(env(), ALICE)

    await assertSucceeds(getDoc(doc(alice, path.user(ALICE))))
    await assertSucceeds(updateDoc(doc(alice, path.settings(ALICE)), { masterVolume: 0.5 }))
  })

  it('clients cannot write derived state', async () => {
    await seed(env(), [[path.scenario('s1'), scenarioDoc('s1')]])
    const alice = as(env(), ALICE)

    await assertFails(updateDoc(doc(alice, path.scenario('s1')), { playCount: 1_000_000 }))
    await assertFails(setDoc(doc(alice, path.run('r1')), runDoc('r1', { validation: 'accepted' })))
  })
})

describe('leaderboards', () => {
  it('return accepted runs on one version, highest score first', async () => {
    await seed(env(), [
      [path.run('mid'), runDoc('mid', { finalScore: 700, validation: 'accepted' })],
      [path.run('top'), runDoc('top', { userUid: BOB, finalScore: 980, validation: 'accepted' })],
      [path.run('low'), runDoc('low', { finalScore: 120, validation: 'accepted' })],
      [path.run('tie'), runDoc('tie', { userUid: BOB, finalScore: 700, validation: 'accepted' })],
      [path.run('pending'), runDoc('pending', { finalScore: 999, validation: 'pending' })],
      [path.run('rejected'), runDoc('rejected', { finalScore: 5000, validation: 'rejected' })],
      [
        path.run('old-version'),
        runDoc('old-version', { finalScore: 990, validation: 'accepted', version: 'scale-v0' }),
      ],
    ])
    const db = as(env(), BOB)

    const board = await getDocs(
      query(
        collection(db, COLLECTIONS.runs),
        where('scenarioVersionId', '==', 'scale-v1'),
        where('validation', '==', 'accepted'),
        orderBy('finalScore', 'desc'),
      ),
    )

    const scores = board.docs.map((snapshot) => snapshot.data().finalScore as number)
    expect(board.docs[0].id).toBe('top')
    expect(scores).toEqual([980, 700, 700, 120])
    expect(board.docs.map((snapshot) => snapshot.id)).not.toContain('pending')
  })

  it('are backed by a declared composite index', () => {
    const indexes = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, '../../../firebase/firestore.indexes.json'),
        'utf8',
      ),
    ) as { indexes: Array<{ collectionGroup: string; fields: Array<Record<string, string>> }> }

    const declared = indexes.indexes.some(
      (index) =>
        index.collectionGroup === 'runs' &&
        JSON.stringify(index.fields) ===
          JSON.stringify([
            { fieldPath: 'scenarioVersionId', order: 'ASCENDING' },
            { fieldPath: 'validation', order: 'ASCENDING' },
            { fieldPath: 'finalScore', order: 'DESCENDING' },
          ]),
    )
    expect(declared).toBe(true)
  })
})

describe('creation timestamps', () => {
  it('are filled in by the server on every base collection', async () => {
    const db = as(env(), ALICE)
    const before = Date.now()
    await setDoc(doc(db, path.user(ALICE)), aliceProfile())
    await setDoc(doc(db, path.scenario('s1')), scenarioDoc('s1'))
    await setDoc(doc(db, versionPath('s1', 'v1')), versionDoc('s1', 'v1'))
    await setDoc(doc(db, path.run('r1')), runDoc('r1', {}))
    const after = Date.now()

    const stamps = [
      (await getDoc(doc(db, path.user(ALICE)))).get('createdAt'),
      (await getDoc(doc(db, path.scenario('s1')))).get('createdAt'),
      (await getDoc(doc(db, versionPath('s1', 'v1')))).get('createdAt'),
      (await getDoc(doc(db, path.run('r1')))).get('playedAt'),
    ]
    for (const stamp of stamps) {
      expect(stamp).toBeInstanceOf(Timestamp)
      // Allow for clock skew between this process and the emulator.
      expect(stamp.toMillis()).toBeGreaterThan(before - 5000)
      expect(stamp.toMillis()).toBeLessThan(after + 5000)
    }
  })

  it('cannot be supplied or backdated by the client', async () => {
    const db = as(env(), ALICE)
    const backdated = Timestamp.fromDate(new Date('2020-01-01'))

    await assertFails(setDoc(doc(db, path.user(ALICE)), aliceProfile({ createdAt: backdated })))
    await assertFails(
      setDoc(doc(db, path.scenario('s1')), scenarioDoc('s1', ALICE, { createdAt: backdated })),
    )
    await assertFails(setDoc(doc(db, path.run('r1')), { ...runDoc('r1', {}), playedAt: backdated }))
  })

  it('cannot be rewritten after creation', async () => {
    await seed(env(), [[path.scenario('s1'), scenarioDoc('s1')]])
    const db = as(env(), ALICE)
    await assertFails(updateDoc(doc(db, path.scenario('s1')), { createdAt: serverTimestamp() }))
  })
})

describe('deletes', () => {
  it('remove the record so a later read comes back empty', async () => {
    const db = as(env(), ALICE)
    const ref = doc(db, path.scenario('s1'))
    await setDoc(ref, scenarioDoc('s1'))
    expect((await getDoc(ref)).exists()).toBe(true)

    await assertSucceeds(deleteDoc(ref))

    const after = await getDoc(ref)
    expect(after.exists()).toBe(false)
    expect(after.data()).toBeUndefined()
    const listed = await getDocs(
      query(collection(db, COLLECTIONS.scenarios), where('authorUid', '==', ALICE)),
    )
    expect(listed.empty).toBe(true)
  })

  it('of user settings leave nothing stale behind', async () => {
    const db = as(env(), ALICE)
    const ref = doc(db, path.settings(ALICE))
    await setDoc(ref, aliceSettings())
    await deleteDoc(ref)
    expect((await getDoc(ref)).exists()).toBe(false)
  })
})
