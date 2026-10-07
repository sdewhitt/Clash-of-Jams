import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import type { Instrument, SkillRating, UserSettings } from '@/lib/schema/types'
import { db } from "@/lib/firebase";
import { skillRatingsPath } from "../schema/collections";

export async function getUserSettings(uid: string): Promise<UserSettings> {
    const settingsQuery = query(collection(db, "userSettings"), where("uid", "==", uid));
    const snapshot = await getDocs(settingsQuery);
    const userDoc = snapshot.docs[0];
    
    return {
        uid: userDoc.id,
        ...userDoc.data(),
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