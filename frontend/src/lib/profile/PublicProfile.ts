import { doc, serverTimestamp, updateDoc, getDoc, deleteDoc, setDoc, } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PublicProfile, UserStatus } from '@/lib/schema/types';
import { COLLECTIONS } from '@/lib/schema/collections';

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

export async function updatePublicProfile(uid: string, savedUsername: string, publicToggle: boolean, bio: boolean, savedBio: string, instrument: boolean, savedInstrument: string, genres: boolean, savedGenres: string[], elos: string[], acceptingFriends: boolean, avatarUrl: string, publicHistory: boolean) {
    const userRef = doc(db, COLLECTIONS.users, uid);
    const docRef = doc(db, COLLECTIONS.publicProfile, uid);

    if (!publicToggle) {
        await updateDoc(userRef, {friends: []});
        await deleteDoc(docRef);
        return;
    }

    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
        await setDoc( docRef, { uid: uid, username: savedUsername, usernameLower: savedUsername.toLowerCase(), displayName: savedUsername, bio: bio ? savedBio : "", preferredInstrument: instrument ? savedInstrument : "", preferredGenres: genres ? savedGenres : [], elos, acceptingFriends: acceptingFriends, updatedAt: serverTimestamp(), publicHistory: publicHistory}, { merge: true } );
    }
    else {
        await setDoc( docRef, { uid: uid, username: savedUsername, usernameLower: savedUsername.toLowerCase(), displayName: savedUsername, avatarUrl: avatarUrl, bio: bio ? savedBio : "", preferredInstrument: instrument ? savedInstrument : "", preferredGenres: genres ? savedGenres : [], elos, acceptingFriends: acceptingFriends, friends: [], updatedAt: serverTimestamp(), publicHistory: publicHistory}, { merge: true } );
    }
}

export async function updateAcceptingFriends( uid: string, accepting: boolean ) {
    const userRef = doc(db, "userSettings", uid);
    const publicRef = doc(db, "publicProfile", uid);

    await updateDoc(publicRef, {
        acceptingFriends: accepting,
        updatedAt: serverTimestamp(),
    });

    await updateDoc(userRef, {
        acceptingFriends: accepting,
        updatedAt: serverTimestamp(),
    });
}


export async function updateEloPublicity( uid: string, elos: string[] ) {
    const userRef = doc(db, "userSettings", uid);
    const publicRef = doc(db, "publicProfile", uid);

    await updateDoc(publicRef, {
        elos: elos,
        updatedAt: serverTimestamp(),
    });

    await updateDoc(userRef, {
        publicElos: elos,
        updatedAt: serverTimestamp(),
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

    await updateDoc(userRef, {
        dnd: dnd,
    });
}