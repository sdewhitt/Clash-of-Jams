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

export async function updatePublicProfile(uid: string, savedUsername: string, publicToggle: boolean, bio: boolean, savedBio: string, instrument: boolean, savedInstrument: string, genres: boolean, savedGenres: string[], elos: string[] ) {
    const docRef = doc(db, COLLECTIONS.publicProfile, uid);

    if (!publicToggle) {
        await deleteDoc(docRef);
        return;
    }
  
    await setDoc( docRef, { uid: uid, username: savedUsername, displayName: savedUsername, bio: bio ? savedBio : "", preferredInstrument: instrument ? savedInstrument : "", preferredGenres: genres ? savedGenres : [], elos, }, { merge: true } );
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