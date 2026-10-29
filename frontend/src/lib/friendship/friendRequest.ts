
import { collection, doc, runTransaction, serverTimestamp, } from 'firebase/firestore'
import { db } from '@/lib/firebase'
  
function requestId(fromUid: string, toUid: string) {
    return `${fromUid}_${toUid}`
}

function friendshipId(uidA: string, uidB: string) {
    return [uidA, uidB].sort().join('_')
}

export async function sendFriendRequest( fromUid: string, toUid: string, ) {
    const requestRef = doc( db, 'friendRequests', requestId(fromUid, toUid), )
    const reverseRequestRef = doc( db, 'friendRequests', requestId(toUid, fromUid), )
    const notificationRef = doc(collection(db, 'notifications'))

    await runTransaction(db, async (tx) => {
        const [request, reverseRequest, ] = await Promise.all([
            tx.get(requestRef), 
            tx.get(reverseRequestRef), 
        ])

        if (request.exists() && request.data().status === 'pending') {
            throw new Error('A friend request is already pending.')
        }

        if ( reverseRequest.exists() && reverseRequest.data().status === 'pending' ) {
            throw new Error(
                'This user has already requested you. Accept their request instead.',
            )
        }

        tx.set(requestRef, 
            { potentialFriends: [fromUid, toUid], status: 'pending', createdAt: serverTimestamp(), }
        )

        tx.set(notificationRef, 
            { notifiedUid: toUid, notifierUid: fromUid, notificationType: 'friend_request', requestId: requestRef.id, read: false, createdAt: serverTimestamp(), }
        )
    })
}

export async function acceptFriendRequest( acceptorUid: string, fromUid: string, ) {
    const requestRef = doc( db, 'friendRequests', requestId(fromUid, acceptorUid), )
    const friendshipRef = doc( db, 'friendships', friendshipId(fromUid, acceptorUid), )
    const notificationRef = doc(collection(db, 'notifications'))

    await runTransaction(db, async (tx) => {
        const [request, friendship] = await Promise.all([
            tx.get(requestRef),
            tx.get(friendshipRef),
        ])

        if (!request.exists() || request.data().status !== 'pending') {
            throw new Error('This request is no longer pending.')
        }

        if (request.data().toUid !== acceptorUid) {
            throw new Error('You cannot accept this request.')
        }

        if (friendship.exists()) {
            throw new Error('This friendship already exists.')
        }

        tx.update(requestRef, {
            status: 'accepted',
            respondedAt: serverTimestamp(),
        })

        tx.set(friendshipRef, {
            members: [fromUid, acceptorUid].sort(),
            createdAt: serverTimestamp(),
        })

        tx.set(notificationRef, {
            recipientUid: fromUid,
            actorUid: acceptorUid,
            type: 'friend_accepted',
            requestId: requestRef.id,
            read: false,
            createdAt: serverTimestamp(),
        })
    })
}

export async function declineFriendRequest( currentUid: string, fromUid: string, ) {
    const requestRef = doc( db, 'friendRequests', requestId(fromUid, currentUid), )

    await runTransaction(db, async (tx) => {
        const request = await tx.get(requestRef)

        if (!request.exists() || request.data().status !== 'pending') {
            throw new Error('This request is no longer pending.')
        }

        if (request.data().toUid !== currentUid) {
            throw new Error('You cannot decline this request.')
        }

        tx.update(requestRef, {
            status: 'declined',
            respondedAt: serverTimestamp(),
        })
    })
}
