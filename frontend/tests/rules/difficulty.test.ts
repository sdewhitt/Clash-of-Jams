import { deleteDoc, doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore'
import { describe, it } from 'vitest'

import {
  ALICE,
  BOB,
  as,
  assertFails,
  assertSucceeds,
  scenarioDoc,
  seed,
  setupRulesEnv,
  runDoc,
} from './env.js'

const env = setupRulesEnv()
const scenarioPath = 'scenarios/scale'
const aggregatePath = scenarioPath + '/difficultyEstimates/v1'
const aggregate = { value: 5, distinctPlayers: 12, source: 'performances', scenarioVersionId: 'v1' }

describe('versioned difficulty aggregates', () => {
  it('allows authenticated public reads and denies anonymous reads', async () => {
    await seed(env(), [
      [scenarioPath, scenarioDoc('scale', ALICE, { visibility: 'public' })],
      [aggregatePath, aggregate],
    ])
    await assertSucceeds(getDoc(doc(as(env(), BOB), aggregatePath)))
    await assertFails(getDoc(doc(as(env(), null), aggregatePath)))
  })

  it('keeps private aggregates visible only to the author or an administrator', async () => {
    await seed(env(), [
      [scenarioPath, scenarioDoc('scale')],
      [aggregatePath, aggregate],
    ])
    await assertSucceeds(getDoc(doc(as(env(), ALICE), aggregatePath)))
    await assertFails(getDoc(doc(as(env(), BOB), aggregatePath)))
    await seed(env(), [['users/' + BOB, { role: 'admin' }]])
    await assertSucceeds(getDoc(doc(as(env(), BOB), aggregatePath)))
    await assertFails(updateDoc(doc(as(env(), BOB), aggregatePath), { value: 10 }))
  })

  it('denies aggregate creation, modification and deletion by browser clients', async () => {
    await seed(env(), [[scenarioPath, scenarioDoc('scale')]])
    const db = as(env(), ALICE)
    await assertFails(setDoc(doc(db, aggregatePath), aggregate))
    await seed(env(), [[aggregatePath, aggregate]])
    await assertFails(updateDoc(doc(db, aggregatePath), { value: 10 }))
    await assertFails(deleteDoc(doc(db, aggregatePath)))
  })

  it('allows ordinary author edits to legacy and published scenarios, while protecting the marker', async () => {
    const db = as(env(), ALICE)
    await seed(env(), [[scenarioPath, scenarioDoc('scale')]])
    await assertSucceeds(updateDoc(doc(db, scenarioPath), { title: 'Legacy edit' }))
    await seed(env(), [
      [
        scenarioPath,
        scenarioDoc('scale', ALICE, { crowdDifficulty: 5, crowdDifficultyVersionId: 'v1' }),
      ],
    ])
    await assertSucceeds(updateDoc(doc(db, scenarioPath), { title: 'Published edit' }))
    await assertFails(updateDoc(doc(db, scenarioPath), { crowdDifficulty: 10 }))
    await assertFails(updateDoc(doc(db, scenarioPath), { crowdDifficultyVersionId: 'v2' }))
    await assertFails(updateDoc(doc(db, scenarioPath), { crowdDifficultyVersionId: deleteField() }))
  })

  it('denies fabricated publication markers and server-owned run evidence', async () => {
    const db = as(env(), ALICE)
    await assertFails(
      setDoc(
        doc(db, scenarioPath),
        scenarioDoc('scale', ALICE, { crowdDifficultyVersionId: 'v1' }),
      ),
    )
    await assertFails(
      setDoc(doc(db, 'runs/forged'), {
        ...runDoc('forged', {}),
        ratingAtPlay: 2000,
        inputSource: 'midi',
        normalizedScore: 0.1,
      }),
    )
  })
})
