import { collection, doc, endAt, getDoc, getDocs, limit, orderBy, query, startAt, } from "firebase/firestore"; 
import { db } from "@/lib/firebase";
import type { PublicProfile, RelationshipStatus, SearchProfile } from "../schema/types";
  
export async function searchPublicUsers( activeUid: string, queryUsername: string ): Promise<SearchProfile[]> {
    const term = queryUsername.trim().toLowerCase();

    if (term.length < 3) {
        return [];
    }

    const activeProfileRef = doc(db, "publicProfile", activeUid);
    const activeProfileSnap = await getDoc(activeProfileRef);

    if (!activeProfileSnap.exists()) {
        return [];
    }

    const activeProfile = activeProfileSnap.data() as PublicProfile;
    const activeFriendIds = new Set(activeProfile.friends ?? []);

    // 2. Search public profiles by username.
    const profilesQuery = query(
        collection(db, "publicProfile"),
        orderBy("usernameLower"),
        startAt(term),
        endAt(term + "\uf8ff"),
        limit(30)
    );

    const snapshot = await getDocs(profilesQuery);

    // 3. Add friendship and mutual-friend information.
    return snapshot.docs
        .map((userDoc) => {
        const profile = userDoc.data() as PublicProfile;

        // Assumes the document ID is the user's Firebase Auth UID.
        const uid = profile.uid || userDoc.id;
        const candidateFriendIds = new Set(profile.friends ?? []);

        // Exclude the current user from search results.
        if (uid === activeUid) {
            return null;
        }

        // Direct friendship?
        const isFriend = activeFriendIds.has(uid);

        // Count friends shared by the active user and candidate.
        let mutualFriendCount = 0;

        for (const friendUid of candidateFriendIds) {
            if (activeFriendIds.has(friendUid)) {
            mutualFriendCount++;
            }
        }

        let relationship: RelationshipStatus = "none";

        if (isFriend) {
            relationship = "friend";
        } else if (mutualFriendCount > 0) {
            relationship = "friendOfFriend";
        }

        return {
            ...profile,
            relationship,
            mutualFriendCount,
        };
    })
    .filter(
        (profile): profile is SearchProfile => profile !== null
    );
}
