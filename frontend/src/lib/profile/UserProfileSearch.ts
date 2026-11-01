import { collection, doc, endAt, getDoc, getDocs, limit, orderBy, query, startAt, where, type QueryConstraint, } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PublicProfile, RelationshipStatus, SearchProfile, } from "@/lib/schema/types";

export async function searchPublicUsers( activeUid: string, queryUsername: string, friend: boolean, limitOverride: boolean): Promise<SearchProfile[]> {
    const term = queryUsername.trim().toLowerCase();

    if (!limitOverride && term.length < 3) {
        return [];
    }

    const activeProfileRef = doc(db, "publicProfile", activeUid);
    const activeProfileSnap = await getDoc(activeProfileRef);

    if (!activeProfileSnap.exists()) {
        return [];
    }

    const activeProfile = activeProfileSnap.data() as PublicProfile;
    const activeFriendIds = new Set(activeProfile.friends ?? []);

    const constraints: QueryConstraint[] = [
        limit(30),
    ];

    if (!limitOverride) {
        constraints.push(orderBy('usernameLower'));
        constraints.push(startAt(term));
        constraints.push(endAt(term + "\uf8ff"));
    }
    
    if (friend) {
        constraints.push(where("friends", "array-contains", activeUid));
    }
    
    const profilesQuery = query(
        collection(db, "publicProfile"),
        ...constraints
    );

    const snapshot = await getDocs(profilesQuery);

    return snapshot.docs
        .map((userDoc) => {
            const profile = userDoc.data() as PublicProfile;

            const uid = profile.uid || userDoc.id;
            const candidateFriendIds = new Set(profile.friends ?? []);

            if (uid === activeUid) {
                return null;
            }

            const isFriend = activeFriendIds.has(uid);

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