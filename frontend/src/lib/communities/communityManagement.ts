import { doc, runTransaction, arrayUnion, getDoc, collection, setDoc, increment, arrayRemove } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { COLLECTIONS, newCommunity, communityMembersPath, newCommunityMembership, communityAnnouncementsPath, newCommunityAnnouncement } from "@/lib/schema/collections";
import type { CommunityMembership } from "@/lib/schema/types";
import { getPublicProfile } from '@/lib/profile/publicProfile'

export async function getCommunityMembership(communityId: string, uid: string): Promise<CommunityMembership | null> {
    const communityMemberPath = communityMembersPath(communityId);
    const communityMemberRef = doc(db, communityMemberPath, uid);

    const communitySnapshot = await getDoc(communityMemberRef);
    if (communitySnapshot.exists()) {
        return communitySnapshot.data() as CommunityMembership;
    }

    return null;
}

export async function joinCommunity(communityId: string, uid: string) {
    await getPublicProfile(uid);

    const userRef = doc(db, COLLECTIONS.users, uid);
    const publicRef = doc(db, COLLECTIONS.publicProfile, uid);

    const communityRef = doc(db, COLLECTIONS.communities, communityId);
    const communityMemberRef = doc(db, communityMembersPath(communityId), uid);

    const communitySnapshot = await getDoc(communityRef);
    if (!communitySnapshot.exists()) {
        throw new Error('Community not found');
    }

    await runTransaction(db, async (transaction) => {
        transaction.update(userRef, {communities: arrayUnion(communityId)});
        transaction.update(publicRef, {communities: arrayUnion(communityId)});
        transaction.update(communityRef, {memberCount: increment(1)});
        transaction.set(communityMemberRef, newCommunityMembership({uid, communityId, role: 'member'}));
    })
}

export async function leaveCommunity(communityId: string, uid: string) {
    await getPublicProfile(uid);

    const userRef = doc(db, COLLECTIONS.users, uid);
    const publicRef = doc(db, COLLECTIONS.publicProfile, uid);

    const communityRef = doc(db, COLLECTIONS.communities, communityId);
    const communityMemberRef = doc(db, communityMembersPath(communityId), uid);

    const communitySnapshot = await getDoc(communityRef);
    if (!communitySnapshot.exists()) {
        throw new Error('Community not found');
    }

    await runTransaction(db, async (transaction) => {
        transaction.update(userRef, {communities: arrayRemove(communityId)});
        transaction.update(publicRef, {communities: arrayRemove(communityId)});
        transaction.update(communityRef, {memberCount: increment(-1)});
        transaction.delete(communityMemberRef);
    })
}

export async function createCommunity(communityIcon: string, communityName: string, communityDescription: string, uid: string, isPublic: boolean) {
    await getPublicProfile(uid);

    if (communityIcon.trim().length === 0) {
        throw new Error('Community icon cannot be empty for community creation');    
    }
    if (communityName.trim().length === 0) {
        throw new Error('Community name cannot be empty for community creation'); 
    }
    else if ((communityName.trim().length < 3) || (communityName.trim().length > 40)) {
        throw new Error("Community name must be between 3-40 characters.");
    }
    if (communityDescription.trim().length === 0) {
        throw new Error('Community name cannot be empty for community creation'); 
    }

    const communityId = communityName.trim().toLocaleLowerCase().replaceAll(" ", "_");
    const communityRef = doc(db, COLLECTIONS.communities, communityId);

    const communityMemberRef = doc(db, communityMembersPath(communityId), uid);

    const communityAnnouncementsRef = collection(db, communityAnnouncementsPath(communityId));
    const communityAnnouncementRef = doc(communityAnnouncementsRef);

    const publicRef = doc(db, COLLECTIONS.publicProfile, uid);
    const userRef = doc(db, COLLECTIONS.users, uid);

    await runTransaction(db, async (transaction) => {
        const newCommunitySnapshot = await transaction.get(communityRef);

        if (newCommunitySnapshot.exists()) {
            throw new Error('Community with that name already exists. Please enter a unique community name.');
        }
        else {
            const userSnapshot = await transaction.get(userRef);
            if (!userSnapshot.exists()) {
                throw new Error('Unable to find user profile for community creation.')
            }
            else {
                if (userSnapshot.data().isProfilePublic) {
                    const publicSnapshot = await transaction.get(publicRef);
                    if (!publicSnapshot.exists()) {
                        throw new Error('Unable to find public user profile for community creation.')
                    }
                    transaction.update(publicRef, {communities: arrayUnion(communityId)})
                }
                else {
                    throw new Error('Cannot create new communities with a private profile. Please set your profile to be public before creating communities');
                }
                transaction.update(userRef, {communities: arrayUnion(communityId)})
            }
            transaction.set(communityRef, newCommunity({id: communityId, name: communityName.trim(), communityIcon: communityIcon.trim(), ownerUid: uid, description: communityDescription.trim(), isPublic: isPublic}));
            transaction.set(communityMemberRef, newCommunityMembership({uid: uid, communityId: communityId, role: 'owner'}));
        }
    })

    await setDoc(communityAnnouncementRef, newCommunityAnnouncement({
        announcerUid: uid, 
        announcementTitle: "Community Creation Information", 
        announcement: `${communityName} is a ${isPublic ? "public" : "private"} community, meaning that ${isPublic ? "any user" : "only invited"} users will be able to join the community.\n\nAt any point in time, you can customize the community within its settings tab, and you grant members permissions under the members tab.`, 
        announcementViewers: ['owner', 'moderator']
    }));

    return communityId;
}