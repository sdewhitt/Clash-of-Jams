
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/schema/collections";
import type { Friendship } from "@/lib/schema/types";

/**
 * Retrieve the friendship record shared by two users.
 *
 * Returns null if the users are not friends or the document
 * does not exist.
 */
export async function getFriendship( uidA: string, uidB: string ): Promise<Friendship | null> {
    if (!uidA || !uidB || uidA === uidB) {
        return null;
    }

    const friendshipId = [uidA, uidB].sort().join("_");
    const friendshipRef = doc(db, COLLECTIONS.friendships, friendshipId);

    const snapshot = await getDoc(friendshipRef);

    if (!snapshot.exists()) {
        return null;
    }

    return {
        ...snapshot.data(),
        id: snapshot.id,
    } as Friendship;
}
