import { collection, getDocs } from "firebase/firestore";
import type { Timestamp } from 'firebase/firestore'
import { db } from "@/lib/firebase";

export type Avatar = {
    aid: string;
    url: string;
    name: string;
    createdDate: Timestamp;
    uid: string;
};

export async function getAvatars(): Promise<Avatar[]> {
    const snapshot = await getDocs(collection(db, "avatars"));

    return snapshot.docs.map((doc) => ({
        aid: doc.id,
        ...doc.data(),
    })) as Avatar[];
}