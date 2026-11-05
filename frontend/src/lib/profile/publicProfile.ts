import { doc, serverTimestamp, updateDoc, getDoc, deleteDoc, setDoc, arrayRemove, runTransaction, } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PublicProfile, UserSettings, UserStatus } from '@/lib/schema/types';
import { COLLECTIONS } from '@/lib/schema/collections';
import { DEFAULT_APPEARANCE, publicAppearance } from '@/lib/profile/profileAppearance';

export async function getPublicProfile(uid: string): Promise<PublicProfile> {
    // Read by id, not by query: the rules grant userProfile/{uid} to its owner by document id, which a collection query can't be shown to satisfy.
    const snapshot = await getDoc(doc(db, COLLECTIONS.publicProfile, uid));
    if (!snapshot.exists()) {
        throw new Error("No public profile found for this user.");
    }

    return {
        ...snapshot.data(),
    } as PublicProfile;
}

export async function updatePublicProfile( uid: string, savedUsername: string, publicToggle: boolean, bio: boolean, savedBio: string, instrument: boolean, savedInstrument: string, genres: boolean, savedGenres: string[], elos: string[], acceptingFriends: boolean, avatarUrl: string, publicHistory: boolean ) {
    const userRef = doc(db, COLLECTIONS.users, uid);
    const docRef = doc(db, COLLECTIONS.publicProfile, uid);

    if (!publicToggle) {
        const userSnapshot = await getDoc(userRef);

        if (userSnapshot.exists()) {
            const userData = userSnapshot.data();

            const friends: string[] = userData.friends ?? [];
            const communities: string[] = userData.communities ?? [];

            const ownedCommunities = await Promise.all(
                communities.map(async (communityUid) => {
                    const communityRef = doc( db, COLLECTIONS.communities, communityUid );
                    const communitySnapshot = await getDoc(communityRef);

                    if ( communitySnapshot.exists() && communitySnapshot.data().ownerUid === uid ) {
                        return communityUid;
                    }

                    return null;
                })
            );

            const ownedCommunityIds = ownedCommunities.filter((communityUid): communityUid is string => communityUid !== null);

            if (ownedCommunityIds.length > 0) {
                throw new Error(
                    "You must transfer ownership of or delete your communities before making your profile private."
                );
            }

            await Promise.all(
                friends.map(async (friendUid) => {
                    const friendRef = doc( db, COLLECTIONS.users, friendUid );
                    const friendPublicRef = doc( db, COLLECTIONS.publicProfile, friendUid );

                    await updateDoc(friendRef, { friends: arrayRemove(uid) });
                    await updateDoc(friendPublicRef, { friends: arrayRemove(uid) });
                })
            );
            
            await Promise.all(
                communities.map(async (communityUid) => {
                    const communityRef = doc( db, COLLECTIONS.communities, communityUid );

                    await updateDoc(communityRef, { members: arrayRemove(uid) });
                })
            );

            await updateDoc(userRef, { friends: [], communities: [] });
        }

        await deleteDoc(docRef);
        return;
    }

    const snapshot = await getDoc(docRef);

    const profileData = {
        uid,
        username: savedUsername,
        usernameLower: savedUsername.toLowerCase(),
        displayName: savedUsername,
        avatarUrl,
        bio: bio ? savedBio : "",
        preferredInstrument: instrument ? savedInstrument : "",
        preferredGenres: genres ? savedGenres : [],
        elos,
        acceptingFriends,
        updatedAt: serverTimestamp(),
        publicHistory
    };

    await setDoc(
        docRef,
        {
            ...profileData,
            ...(!snapshot.exists() && {
                friends: [],
                communities: []
            })
        },
        { merge: true }
    );
}

export async function updateAcceptingFriends( uid: string, accepting: boolean ) {
    const userRef = doc(db, "userSettings", uid);
    const publicRef = doc(db, "publicProfile", uid);

    await runTransaction(db, async (transaction) => {
        transaction.update(userRef, {acceptingFriends: accepting, updatedAt: serverTimestamp(),});
        transaction.update(publicRef, {acceptingFriends: accepting, updatedAt: serverTimestamp(),});
    });
}


export async function updateEloPublicity( uid: string, elos: string[] ) {
    const userRef = doc(db, "userSettings", uid);
    const publicRef = doc(db, "publicProfile", uid);

    await runTransaction(db, async (transaction) => {
        transaction.update(userRef, {publicElos: elos, updatedAt: serverTimestamp(),});
        transaction.update(publicRef, {elos: elos, updatedAt: serverTimestamp(),});
    });
}

export async function getUserStatus( uid: string): Promise<UserStatus> {
    const snapshot = await getDoc(doc(db, COLLECTIONS.userStatus, uid));
    if (!snapshot.exists()) {
        throw new Error("No user status found for this user")
    }

    return {
        ...snapshot.data(),
    } as UserStatus
}

export async function updateDoNotDistrub( uid: string, dnd: boolean ) {
    const userRef = doc(db, "userStatus", uid);

    await updateDoc(userRef, { dnd: dnd, });
}