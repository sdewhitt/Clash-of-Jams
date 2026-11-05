import { collection, doc, runTransaction, getDoc, arrayUnion, increment } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, communityMembersPath, communityRequestsPath, newAppNotification, newCommunityMembership, newCommunityRequest } from '@/lib/schema/collections';
  
function requestId(communityId: string, uid: string) {
    return [communityId, uid].join('_')
}

export async function getFriendName (userUid: string, ) {
    const requestRef = doc(db, 'publicProfile', userUid);

    const snapshot = await getDoc(requestRef);
    if (!snapshot.exists()) {
        throw new Error("No public profile associated with that Uid.");
    }   

    return {
        displayName: snapshot.data().displayName as string
    };
}

export async function getFriendRequest (requestId: string, ) {
    const requestRef = doc(db, 'friendRequests', requestId);

    const snapshot = await getDoc(requestRef);
    if (!snapshot.exists()) {
        throw new Error("No friend request with that requestId found.");
    }

    return {
        uids: snapshot.data().potentialFriends as string[]
    };
}

/**
 * This is going to be implemented in sprint 3 with the creation of pending request page? Maybe? *

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
**/

export async function sendCommunityRequest( communityId: string, initiatorUid: string, memberUid: string, outsiderUid: string, ) {
    const requestRef = doc(db, communityRequestsPath(communityId), requestId(communityId, outsiderUid))
    const publicRef = doc(db, COLLECTIONS.publicProfile, outsiderUid);
    const notificationRef = doc(collection(db, 'notifications'));

    await runTransaction(db, async (tx) => {
        const [request, publicProfile ] = await Promise.all([
            tx.get(requestRef), 
            tx.get(publicRef),
        ])

        if (!publicProfile.exists()) {
            throw new Error('Outside members must have a public profile to join communities.')
        }

        if (memberUid === outsiderUid) {
            throw new Error('You cannot send a community request to yourself.')
        }

        if (request.exists()) {
            if (request.data().status === 'pending' && request.data().outsiderUid === outsiderUid) {
                throw new Error('A community request is already pending.')
            }
            else if (request.data().status === 'declined') {
                if (initiatorUid == memberUid) {
                    tx.update(requestRef,  ({ status: 'pending', requestType: 'community_invitation_request', }))
                    tx.set(notificationRef, newAppNotification({ notifiedUid: outsiderUid, notifierUid: memberUid, notificationType: 'community_invitation_request_sent', requestId: requestRef.id, }))
                }
                else {
                    tx.update(requestRef,  ({ status: 'pending', requestType: 'community_knock_request', }))
                    tx.set(notificationRef, newAppNotification({ notifiedUid: memberUid, notifierUid: outsiderUid, notificationType: 'community_knock_request_sent', requestId: requestRef.id, }))
                }
                return;
            }
            else {
                throw new Error("Invalid attempt to send a community request.")
            }
        }

        if (initiatorUid == memberUid) {
            tx.set(requestRef,  newCommunityRequest({ memberUid: memberUid, outsiderUid: outsiderUid, requestType: 'community_invitation_request', }))
            tx.set(notificationRef, newAppNotification({ notifiedUid: outsiderUid, notifierUid: memberUid, notificationType: 'community_invitation_request_sent', requestId: requestRef.id, }))
        }
        else {
            tx.set(requestRef,  newCommunityRequest({ memberUid: memberUid, outsiderUid: outsiderUid, requestType: 'community_knock_request', }))
            tx.set(notificationRef, newAppNotification({ notifiedUid: memberUid, notifierUid: outsiderUid, notificationType: 'community_knock_request_sent', requestId: requestRef.id, }))
        }
    })
}

export async function acceptCommunityRequest( communityId: string, initiatorUid: string, memberUid: string, outsiderUid: string, ) {
    const requestRef = doc(db, communityRequestsPath(communityId), `${communityId}_${outsiderUid}`);
    const memberRef = doc(db, communityMembersPath(communityId), outsiderUid);
    const publicRef = doc(db, COLLECTIONS.publicProfile, outsiderUid);
    const userRef = doc(db, COLLECTIONS.users, outsiderUid);
    const communityRef = doc(db, COLLECTIONS.communities, communityId);
    const notificationRef = doc(collection(db, "notifications"));

    await runTransaction(db, async (tx) => {
        // All reads must happen before writes.
        const [request, publicProfile, member, user, community,] = await Promise.all([
            tx.get(requestRef),
            tx.get(publicRef),
            tx.get(memberRef),
            tx.get(userRef),
            tx.get(communityRef),
        ]);

        if (!request.exists() || request.data().status !== "pending") {
            throw new Error("This request is no longer pending.");
        }

        if (!publicProfile.exists() || !user.exists()) {
            throw new Error("Error occurred when fetching user profiles.");
        }

        if (!community.exists()) {
            throw new Error("Community not found.");
        }

        if (member.exists()) {
            throw new Error("This user is already a member.");
        }
        
        const displayName = publicProfile.data().displayName ?? publicProfile.data().username ?? "...";

        tx.update(requestRef, { status: "accepted", });
        tx.update(userRef, { communities: arrayUnion(communityId), });
        tx.update(publicRef, { communities: arrayUnion(communityId), });
        tx.update(communityRef, { memberCount: increment(1), });
        tx.set(memberRef, newCommunityMembership({ uid: outsiderUid, communityId, userDisplayName: displayName, role: "member", }));

        if (initiatorUid === memberUid) {
            tx.set(notificationRef, newAppNotification({ notifiedUid: outsiderUid, notifierUid: memberUid, notificationType: "community_knock_request_accepted", requestId: requestRef.id, }));
        } else {
            tx.set(notificationRef, newAppNotification({ notifiedUid: memberUid, notifierUid: outsiderUid, notificationType: "community_invitation_request_accepted", requestId: requestRef.id, }));
        }
    });
}


export async function declineCommunityRequest( communityId: string, initiatorUid: string, memberUid: string, outsiderUid: string, ) {
    const requestRef = doc( db, communityRequestsPath(communityId), requestId(communityId, outsiderUid), );
    const notificationRef = doc(collection(db, 'notifications'));

    await runTransaction(db, async (tx) => {
        const request = await tx.get(requestRef)

        if (!request.exists() || request.data().status !== 'pending') {
            throw new Error('This request is no longer pending.')
        }

        tx.update(requestRef, { status: 'declined', })
        console.log(initiatorUid)
        console.log(memberUid)
        if (initiatorUid === memberUid) {
            tx.set(notificationRef, newAppNotification({ notifiedUid: outsiderUid, notifierUid: memberUid, notificationType: 'community_knock_request_declined', requestId: requestRef.id, }))
        }
        else {
            tx.set(notificationRef, newAppNotification({ notifiedUid: memberUid, notifierUid: outsiderUid, notificationType: 'community_invitation_request_declined', requestId: requestRef.id, }))
        }
    })
}