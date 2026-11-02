import { arrayRemove, doc, runTransaction, } from 'firebase/firestore';
import { db } from '@/lib/firebase'

function friendshipId(uidA: string, uidB: string) {
    return [uidA, uidB].sort().join('_')
}

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