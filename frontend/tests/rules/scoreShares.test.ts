/**
 * User story #37: a run's score, sent to friends. Only the player who earned it can send it,
 * the score must match the run, and only the sender and the recipients can read it.
 */
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc, where } from 'firebase/firestore'
import { describe, it } from 'vitest'

import { COLLECTIONS, newScoreShare } from '../../src/lib/schema/collections.ts'
import {
  ALICE,
  as,
  assertFails,
  assertSucceeds,
  BOB,
  path,
  runDoc,
  seed,
  setupRulesEnv,
} from './env.ts'

const env = setupRulesEnv()
const CAROL = 'carol-uid'

const sharePath = (id: string) => `${COLLECTIONS.scoreShares}/${id}`

function shareDoc(id: string, overrides: Partial<Parameters<typeof newScoreShare>[0]> = {}) {
  return newScoreShare({
    id,
    ownerUid: ALICE,
    runId: 'r1',
    scenarioId: 'scale',
    scenarioTitle: 'C major scale',
    finalScore: 81_000,
    recipientUids: [BOB],
    ...overrides,
  })
}

/** Alice's run of the scale scenario that scored 81,000, which the shares point at. */
async function seedRun() {
  await seed(env(), [[path.run('r1'), runDoc('r1', { userUid: ALICE, finalScore: 81_000 })]])
}

describe('score shares', () => {
  it('the player sends their real score to friends', async () => {
    await seedRun()

    await assertSucceeds(setDoc(doc(as(env(), ALICE), sharePath('a')), shareDoc('a')))
  })

  it('a share cannot claim a better score than the run earned', async () => {
    await seedRun()

    await assertFails(
      setDoc(doc(as(env(), ALICE), sharePath('a')), shareDoc('a', { finalScore: 100_000 })),
    )
  })

  it('no one sends a run they did not play, or sends to themselves, or to no one', async () => {
    await seedRun()

    await assertFails(
      setDoc(
        doc(as(env(), BOB), sharePath('a')),
        shareDoc('a', { ownerUid: BOB, recipientUids: [CAROL] }),
      ),
    )
    await assertFails(
      setDoc(doc(as(env(), ALICE), sharePath('b')), shareDoc('b', { recipientUids: [ALICE] })),
    )
    await assertFails(
      setDoc(doc(as(env(), ALICE), sharePath('c')), shareDoc('c', { recipientUids: [] })),
    )
  })

  it('only the sender and the recipients can read a share', async () => {
    await seedRun()
    await seed(env(), [[sharePath('a'), shareDoc('a')]])

    await assertSucceeds(getDoc(doc(as(env(), ALICE), sharePath('a'))))
    await assertSucceeds(getDoc(doc(as(env(), BOB), sharePath('a'))))
    await assertFails(getDoc(doc(as(env(), CAROL), sharePath('a'))))
    await assertFails(getDoc(doc(as(env(), null), sharePath('a'))))
  })

  it('a recipient lists what was sent to them', async () => {
    await seedRun()
    await seed(env(), [[sharePath('a'), shareDoc('a')]])
    const sentTo = (uid: string) =>
      getDocs(
        query(
          collection(as(env(), uid), COLLECTIONS.scoreShares),
          where('recipientUids', 'array-contains', uid),
          orderBy('createdAt', 'desc'),
        ),
      )

    await assertSucceeds(sentTo(BOB))
    await assertSucceeds(sentTo(CAROL))
  })
})
