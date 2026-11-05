import { doc, serverTimestamp, getDoc, runTransaction} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserPreferences } from '@/lib/schema/types';
import { COLLECTIONS } from '@/lib/schema/collections';

export async function getUserPreferences(uid: string): Promise<UserPreferences> {
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

    await runTransaction(db, async (transaction) => {
        transaction.update(userRef, {preferredGenres: genres, updatedAt: serverTimestamp(),});

        const docSnap = await getDoc(publicRef);
        if (docSnap.exists()) {
            transaction.update(publicRef, { preferredGenres: publicGenres ? genres : [], });
        }
    });
}

export async function updatePreferredInstrument( uid: string, publicInstrument: boolean, preferredInstrument: string ) {
    const userRef = doc(db, "userPreferences", uid);    
    const publicRef = doc(db, "publicProfile", uid);

    await runTransaction(db, async (transaction) => {
        transaction.update(userRef, {preferredInstrument: preferredInstrument, updatedAt: serverTimestamp(),});

        const docSnap = await getDoc(publicRef);
        if (docSnap.exists()) {
            transaction.update(publicRef, { preferredInstrument: publicInstrument ? preferredInstrument : "", });
        }
    });
}