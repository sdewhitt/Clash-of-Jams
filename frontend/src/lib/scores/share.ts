/**
 * Sending a run's result to friends, and listing the results friends have sent (user story
 * #37). A share is one scoreShares document: a snapshot of the scenario title and score,
 * and the friends it went to. See docs/firestore-schema.md for why it is a snapshot.
 */
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc, where } from 'firebase/firestore'

import { db } from '@/lib/firebase'
import { COLLECTIONS, newScoreShare } from '@/lib/schema/collections'
import type { Friendship, ScoreShare, UserProfile } from '@/lib/schema/types'

export interface Friend {
  uid: string
  displayName: string
}

export interface SharedScore {
  share: ScoreShare
  fromName: string
}

/** The user's accepted friends, by display name. */
export async function listFriends(uid: string): Promise<Friend[]> {
  const friendships = collection(db, COLLECTIONS.friendships)
  const accepted = where('state', '==', 'accepted')
  const [asA, asB] = await Promise.all([
    getDocs(query(friendships, where('idA', '==', uid), accepted)),
    getDocs(query(friendships, where('idB', '==', uid), accepted)),
  ])
  const friendUids = [
    ...asA.docs.map((snapshot) => (snapshot.data() as Friendship).idB),
    ...asB.docs.map((snapshot) => (snapshot.data() as Friendship).idA),
  ]
  const friends = await Promise.all(
    friendUids.map(async (friendUid) => ({
      uid: friendUid,
      displayName: await displayNameOf(friendUid),
    })),
  )
  return friends.sort((a, b) => a.displayName.localeCompare(b.displayName))
}

export async function shareScore(args: {
  ownerUid: string
  runId: string
  scenarioId: string
  scenarioTitle: string
  finalScore: number
  message: string
  recipientUids: string[]
}): Promise<string> {
  const ref = doc(collection(db, COLLECTIONS.scoreShares))
  await setDoc(ref, newScoreShare({ id: ref.id, ...args }))
  return ref.id
}

/** Results friends have sent this user, newest first. */
export async function listScoresSharedWithMe(uid: string): Promise<SharedScore[]> {
  const snapshot = await getDocs(
    query(
      collection(db, COLLECTIONS.scoreShares),
      where('recipientUids', 'array-contains', uid),
      orderBy('createdAt', 'desc'),
    ),
  )
  return Promise.all(
    snapshot.docs.map(async (entry) => {
      const share = entry.data() as ScoreShare
      return { share, fromName: await displayNameOf(share.ownerUid) }
    }),
  )
}

/** A private profile can't be read, so its owner shows as a generic friend. */
async function displayNameOf(uid: string): Promise<string> {
  try {
    const profile = await getDoc(doc(db, COLLECTIONS.users, uid))
    const data = profile.data() as UserProfile | undefined
    return data?.displayName || data?.username || 'A friend'
  } catch {
    return 'A friend'
  }
}
