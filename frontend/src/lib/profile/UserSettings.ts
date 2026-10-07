import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import type { Instrument, SkillRating, UserSettings } from '@/lib/schema/types'
import { db } from "@/lib/firebase";
import { COLLECTIONS, skillRatingsPath } from "../schema/collections";

export async function getUserSettings(uid: string): Promise<UserSettings> {
    // Read by id, not by query: the rules grant userSettings/{uid} to its owner by
    // document id, which a collection query can't be shown to satisfy.
    const snapshot = await getDoc(doc(db, COLLECTIONS.userSettings, uid));
    if (!snapshot.exists()) {
        throw new Error("No settings found for this user.");
    }

    return {
        uid: snapshot.id,
        ...snapshot.data(),
    } as UserSettings;
}

export async function getSpecificUserElo(uid: string, instrument: Instrument): Promise<SkillRating | null> {
    const eloQuery = doc(db, skillRatingsPath(uid), instrument);
    const snapshot = await getDoc(eloQuery);
    if (!snapshot.exists()) {
        return null;
    }
    return snapshot.data() as SkillRating;
}

export async function getUserElos( uid: string ): Promise<SkillRating[]> {
  const ratingsRef = collection( db, skillRatingsPath(uid) );
  const snapshot = await getDocs(ratingsRef);

  return snapshot.docs.map( (doc) => doc.data() as SkillRating );
}