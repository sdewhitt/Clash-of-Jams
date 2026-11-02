import { doc, serverTimestamp, updateDoc, getDoc} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserPreferences } from '@/lib/schema/types';
import { COLLECTIONS } from '@/lib/schema/collections';

export async function getUserPreferences(uid: string): Promise<UserPreferences> {
    // Read by id, not by query: the rules grant userProfile/{uid} to its owner by document id, which a collection query can't be shown to satisfy.
    const snapshot = await getDoc(doc(db, COLLECTIONS.userPreferences, uid));
    if (!snapshot.exists()) {
        throw new Error("No settings found for this user.");
    }

    return {
        ...snapshot.data(),
    } as UserPreferences;
}

export async function updatePreferredGenres( uid: string, publicGenres: boolean, genres: string[] ) {
    const userRef = doc(db, "userPreferences", uid);
    const publicRef = doc(db, "publicProfile", uid);

    await updateDoc(userRef, { 
        preferredGenres: genres, 
        updatedAt: serverTimestamp(),
    });

    const docSnap = await getDoc(publicRef);
    if (docSnap.exists()) {
        await updateDoc(publicRef, { preferredGenres: publicGenres ? genres : [], });
    }
}

export async function updatePreferredInstrument( uid: string, publicInstrument: boolean, preferredInstrument: string ) {
    const userRef = doc(db, "userPreferences", uid);    
    const publicRef = doc(db, "publicProfile", uid);

    await updateDoc(userRef, {
        preferredInstrument: preferredInstrument,
        updatedAt: serverTimestamp(),
    });

    const docSnap = await getDoc(publicRef);
    if (docSnap.exists()) {
        await updateDoc(publicRef, { preferredInstrument: publicInstrument ? preferredInstrument : "", });
    }
}