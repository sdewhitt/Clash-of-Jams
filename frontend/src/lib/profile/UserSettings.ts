import { collection, getDocs, query, where } from "firebase/firestore";
import type { Timestamp } from 'firebase/firestore'
import { db } from "@/lib/firebase";

export type userSettings = {
    inputLatencyOffsetMs: bigint;
    masterVolume: number;
    metronomeEnabled: boolean;
    preferredInstrument: string
    reduceFlashing: boolean;
    theme: string;
    uid: string;
    updatedAt: Timestamp;
};

export async function getUserSettings(uid: string): Promise<userSettings> {
    const settingsQuery = query(collection(db, "userSettings"), where("uid", "==", uid));
    const snapshot = await getDocs(settingsQuery)
    const userDoc = snapshot.docs[0]
    
    return {
        uid: userDoc.id,
        ...userDoc.data(),
    } as userSettings;
}