import { collection, getDocs, query, where } from "firebase/firestore";
import type { UserSettings } from '@/lib/schema/types'
import { db } from "@/lib/firebase";

export async function getUserSettings(uid: string): Promise<UserSettings> {
    const settingsQuery = query(collection(db, "userSettings"), where("uid", "==", uid));
    const snapshot = await getDocs(settingsQuery)
    const userDoc = snapshot.docs[0]
    
    return {
        uid: userDoc.id,
        ...userDoc.data(),
    } as UserSettings;
}