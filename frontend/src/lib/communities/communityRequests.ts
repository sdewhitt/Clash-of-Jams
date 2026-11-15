import { collection, doc, runTransaction, arrayUnion, increment, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, communityMembersPath, communityRequestsPath, newAppNotification, newCommunityMembership, newCommunityRequest } from '@/lib/schema/collections';
import { useState, useEffect } from 'react';
import type { CommunityRequest } from '@/lib/schema/types';
  
function requestId(communityId: string, uid: string) {
    return [communityId, uid].join('_')
}

export function useRequestStatus(communityId: string, outsiderUid: string, activeUid: string,) {
    const [request, setRequest] = useState<CommunityRequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setRequest(null);
        setError(null);

        if (!communityId || !outsiderUid || !activeUid) {
            setLoading(false);
            return;
        }

        setLoading(true);

        const requestRef = doc(
            db,
            communityRequestsPath(communityId),
            requestId(communityId, outsiderUid),
        );

        return onSnapshot(
            requestRef,
            (snapshot) => {
                setRequest(
                    snapshot.exists()
                        ? (snapshot.data() as CommunityRequest)
                        : null,
                );
                setLoading(false);
            },
            (err) => {
                console.error('Request listener failed:', err);
                setRequest(null);
                setError('Unable to load the community request.');
                setLoading(false);
            },
        );
    }, [communityId, outsiderUid, activeUid]);

    let communityStatus: string | null = null;

    if (request?.status === 'pending') {
        const senderUid = request.requestType === 'community_invitation_request' ? request.memberUid : request.outsiderUid;

        communityStatus = senderUid === activeUid ? 'sent_pending' : 'recieved_pending';
    } else if (request?.status === 'accepted' || request?.status === 'declined' || request?.status === 'blocked') {
        communityStatus = request.status;
    }

    return {
        communityStatus,
        requestType: request?.requestType ?? null,
        loading,
        error,
    };
}

export async function sendCommunityRequest( communityId: string, initiatorUid: string, memberUid: string | null, outsiderUid: string, ) {
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

        if (memberUid && memberUid === outsiderUid) {
            throw new Error('You cannot send a community request to yourself.')
        }

        const existingStatus = request.data()?.status;

        if (existingStatus === 'pending') {
            throw new Error('A community request is already pending.');
        }

        if (request.exists() && existingStatus !== 'declined' && existingStatus !== 'canceled') {
            throw new Error('Invalid attempt to send a community request.');
        }

        const isInvitation = initiatorUid === memberUid;

        tx.set(requestRef, newCommunityRequest({memberUid, outsiderUid, requestType: isInvitation ? 'community_invitation_request' : 'community_knock_request',}),);

        if (initiatorUid === memberUid) {
            tx.set(notificationRef, newAppNotification({notifiedUid: outsiderUid, notifierUid: memberUid, notificationType: 'community_invitation_request_sent', requestId: requestRef.id,}),);
        }
    })
}

export async function acceptCommunityRequest( communityId: string, initiatorUid: string, memberUid: string | null, outsiderUid: string, ) {
    const requestRef = doc(db, communityRequestsPath(communityId), `${communityId}_${outsiderUid}`);
    const memberRef = doc(db, communityMembersPath(communityId), outsiderUid);
    const publicRef = doc(db, COLLECTIONS.publicProfile, outsiderUid);
    const userRef = doc(db, COLLECTIONS.users, outsiderUid);
    const communityRef = doc(db, COLLECTIONS.communities, communityId);
    const notificationRef = doc(collection(db, "notifications"));

    await runTransaction(db, async (tx) => {
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
            tx.update(requestRef, { memberUid: memberUid });
            tx.set(notificationRef, newAppNotification({ notifiedUid: outsiderUid, notifierUid: memberUid, notificationType: "community_knock_request_accepted", requestId: requestRef.id, }));
        }
    });
}

export async function cancelCommunityRequest( communityId: string, outsiderUid: string, ) {
    const requestRef = doc( db, communityRequestsPath(communityId), requestId(communityId, outsiderUid), );

    await runTransaction(db, async (tx) => {
        const snapshot = await tx.get(requestRef);
        const request = snapshot.data();

        if (!request || request.status !== 'pending' || request.requestType !== 'community_knock_request' || request.outsiderUid !== outsiderUid) {
            throw new Error('This join request can no longer be canceled.');
        }

        tx.update(requestRef, { status: 'canceled' });
    });
}

export async function declineCommunityRequest( communityId: string, initiatorUid: string, memberUid: string | null, outsiderUid: string, ) {
    const requestRef = doc( db, communityRequestsPath(communityId), requestId(communityId, outsiderUid), );
    const notificationRef = doc(collection(db, 'notifications'));

    await runTransaction(db, async (tx) => {
        const request = await tx.get(requestRef)
        if (!request.exists() || request.data().status !== 'pending') {
            throw new Error('This request is no longer pending.')
        }

        tx.update(requestRef, { status: 'declined', })
   
        if (initiatorUid === memberUid) {
            tx.update(requestRef, { memberUid: memberUid, })
            tx.set(notificationRef, newAppNotification({ notifiedUid: outsiderUid, notifierUid: memberUid, notificationType: 'community_knock_request_declined', requestId: requestRef.id, }))
        }
    })
}