import { /*collection,*/ arrayRemove, doc, runTransaction, } from 'firebase/firestore';
import { db } from '@/lib/firebase'
// import { useEffect, useState } from 'react';
// import { newAppNotification, } from '../schema/collections';

function friendshipId(uidA: string, uidB: string) {
    return [uidA, uidB].sort().join('_')
}

// export async function blockUser( actorUid: string, toUid: string, ) {
//     const requestRef = doc( db, 'friendRequests', friendshipId(actorUid, toUid), )
//     const friendshipRef = doc( db, 'friendships', friendshipId(actorUid, toUid), )
//     const notificationRef = doc(collection(db, 'notifications'))

//     await runTransaction(db, async (tx) => {
//         const [request, friendship] = await Promise.all([
//             tx.get(requestRef),
//             tx.get(friendshipRef),
//         ])

//         if (!request.exists() || request.data().status !== 'pending') {
//             throw new Error('This request is no longer pending.')
//         }

//         if (request.data().toUid !== acceptorUid) {
//             throw new Error('You cannot accept this request.')
//         }

//         if (friendship.exists()) {
//             throw new Error('This friendship already exists.')
//         }

//         tx.update(requestRef, { status: 'blocked' })
//         tx.set(friendshipRef, newFriendship({ uidOne: fromUid, uidTwo: acceptorUid, }))
//         tx.set(notificationRef, newAppNotification({ notifiedUid: acceptorUid, notifierUid: fromUid, notificationType: 'friend_request_accepted', requestId: requestRef.id, }))
//     })
// }


export async function removeFriend(actorUid: string, friendUid: string,) {
    if (!actorUid || !friendUid || actorUid === friendUid) {
        throw new Error('Invalid friendship.');
    }

    const pairId = friendshipId(actorUid, friendUid);

    const requestRef = doc(db, 'friendRequests', pairId);
    const friendshipRef = doc(db, 'friendships', pairId);

    const actorRef = doc(db, 'users', actorUid);
    const publicActorRef = doc(db, 'publicProfile', actorUid);

    const friendRef = doc(db, 'users', friendUid);
    const publicFriendRef = doc(db, 'publicProfile', friendUid);

    await runTransaction(db, async (tx) => {
        const [friendship, request] = await Promise.all([
            tx.get(friendshipRef),
            tx.get(requestRef),
        ]);

        if (!friendship.exists()) {
            throw new Error('This friendship does not exist.');
        }

        const friendshipData = friendship.data();

        if (!(friendshipData.uidA === actorUid && friendshipData.uidB === friendUid ) && !(friendshipData.uidA === friendUid && friendshipData.uidB === actorUid)) {
            throw new Error('Invalid friendship.');
        }

        if (!request.exists() || request.data().status !== 'accepted') {
            throw new Error('The associated friend request is missing or invalid.');
        }

        tx.delete(requestRef);
        tx.delete(friendshipRef);

        tx.update(actorRef, { friends: arrayRemove(friendUid), });
        tx.update(publicActorRef, { friends: arrayRemove(friendUid), });

        tx.update(friendRef, { friends: arrayRemove(actorUid), });
        tx.update(publicFriendRef, { friends: arrayRemove(actorUid), });
    });
}
