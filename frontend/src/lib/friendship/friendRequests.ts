import { collection, doc, onSnapshot, runTransaction, arrayUnion } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useEffect, useState } from 'react';
import { newAppNotification, newFriendRequests, newFriendship } from '../schema/collections';
  
function friendshipId(uidA: string, uidB: string) {
    return [uidA, uidB].sort().join('_')
}

export function useFriendshipStatus ( actorUid: string, friendUid: string ) {
    const [ friendStatus, setFriendStatus ] = useState<string | null>(null);
    const [ loading, setLoading ] = useState(true);

    useEffect(() => {
        if (!actorUid || !friendUid) {
            setFriendStatus(null);
            setLoading(false);
            return;
        }

        setFriendStatus(null);
        setLoading(true);

        const friendRef = doc(db, 'friendRequests', friendshipId(actorUid, friendUid));

        let friendData: any = null

        const updateStatus = () => {
            if ( friendData?.status === 'accepted' ) {
                setFriendStatus('accepted');
                return;
            }
            else if ( friendData?.status === 'pending' ) {
                if ( friendData?.initiatorUid == actorUid) {
                    setFriendStatus('sent_pending');
                }
                else {
                    setFriendStatus('recieved_pending')
                }
                return;
            }
            else if ( friendData?.status === 'declined' ) {
                setFriendStatus('declined');
                return;
            }
            else if (friendData?.status === 'blocked' ) {
                if ( friendData?.initiatorUid == actorUid) {
                    setFriendStatus('sent_blocked');
                }
                else {
                    setFriendStatus('recieved_blocked')
                }
                return;
            }

            setFriendStatus(null);
        };

        let friendLoaded = false;
        
        const subscribeFriend = onSnapshot(
            friendRef,
            (snapshot) => {
                friendData = snapshot.exists()
                    ? snapshot.data()
                    : null;

                    friendLoaded = true;

                updateStatus();

                if (friendLoaded) {
                    setLoading(false);
                }
            },
            (error) => {
                console.error('Request listener failed:', error);
                setLoading(false);
            }
        );

        return () => {
            subscribeFriend();
        };

    }, [actorUid, friendUid]);

    return {
        friendStatus, loading
    };
}

export async function sendFriendRequest( actorUid: string, toUid: string, ) {
    const requestRef = doc(db, 'friendRequests', friendshipId(actorUid, toUid),)
    const notificationRef = doc(collection(db, 'notifications'))

    await runTransaction(db, async (tx) => {
        const [request, ] = await Promise.all([
            tx.get(requestRef), 
        ])

        if (actorUid === toUid) {
            throw new Error('You cannot send a friend request to yourself.')
        }

        if (request.exists()) {
            if (request.data().status === 'pending' && request.data().initiatorUid === actorUid) {
                throw new Error('A friend request is already pending.')
            }
            else if (request.data().status === 'pending' && request.data().initiatorUid === toUid) {
                throw new Error(
                    'This user has already requested you. Accept their request instead.',
                )
            }
        }

        tx.set(requestRef,  newFriendRequests({ uidOne: actorUid, uidTwo: toUid, initiatorUid: actorUid, state: 'pending', }))
        tx.set(notificationRef, newAppNotification({ notifiedUid: toUid, notifierUid: actorUid, notificationType: 'friend_request_sent', requestId: requestRef.id, }))
    })
}

export async function acceptFriendRequest( actorUid: string, acceptorUid: string, ) {
    const requestRef = doc( db, 'friendRequests', friendshipId(actorUid, acceptorUid), );
    const friendshipRef = doc( db, 'friendships', friendshipId(actorUid, acceptorUid), );
    
    const actorRef = doc(db, 'users', actorUid);
    const publicActorRef = doc(db, 'publicProfile', actorUid);

    const acceptorRef = doc(db, 'users', acceptorUid);
    const publicAcceptorRef = doc(db, 'publicProfile', acceptorUid);

    const notificationRef = doc(collection(db, 'notifications'));

    await runTransaction(db, async (tx) => {
        const [ request, friendship, actor, acceptor, publicActor, publicAcceptor, ] = await Promise.all([
            tx.get(requestRef),
            tx.get(friendshipRef),
            tx.get(actorRef),
            tx.get(acceptorRef),
            tx.get(publicActorRef),
            tx.get(publicAcceptorRef),
        ]);

        if (!actor.exists() || !acceptor.exists() || !publicActor.exists() || !publicAcceptor.exists()) {
            throw new Error('Error occurred when fetching user profiles.');
        }

        if (!request.exists() || request.data().status !== 'pending') {
            throw new Error('This request is no longer pending.');
        }

        if (request.data().initiatorUid === actorUid || !request.data().potentialFriends.includes(acceptorUid)) {
            throw new Error('Invalid friend request.');
        }

        if (friendship.exists()) {
            throw new Error('This friendship already exists.');
        }

        tx.update(requestRef, { status: 'accepted', });

        tx.update(actorRef, { friends: arrayUnion(acceptorUid), });
        tx.update(publicActorRef, { friends: arrayUnion(acceptorUid), });

        tx.update(acceptorRef, { friends: arrayUnion(actorUid), });
        tx.update(publicAcceptorRef, { friends: arrayUnion(actorUid), });

        tx.set(friendshipRef, newFriendship({ uidOne: actorUid, uidTwo: acceptorUid, }),);

        tx.set(notificationRef, newAppNotification({ notifiedUid: acceptorUid, notifierUid: actorUid, notificationType: 'friend_request_accepted', requestId: requestRef.id, }), );
    });
}

export async function declineFriendRequest( actorUid: string, otherUid: string, ) {
    const requestRef = doc( db, 'friendRequests', friendshipId(otherUid, actorUid), );
    const notificationRef = doc(collection(db, 'notifications'));

    await runTransaction(db, async (tx) => {
        const request = await tx.get(requestRef)

        if (!request.exists() || request.data().status !== 'pending') {
            throw new Error('This request is no longer pending.')
        }

        if (request.data().initiatorUid === actorUid) {
            tx.delete(requestRef)
            tx.set(notificationRef, newAppNotification({ notifiedUid: otherUid, notifierUid: actorUid, notificationType: 'friend_request_canceled', requestId: requestRef.id, }))
        }
        else {
            tx.update(requestRef, { status: 'declined', })
            tx.set(notificationRef, newAppNotification({ notifiedUid: otherUid, notifierUid: actorUid, notificationType: 'friend_request_declined', requestId: requestRef.id, }))
        }
    })
}
