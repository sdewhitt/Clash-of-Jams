import { collection, doc, endAt, getDoc, getDocs, limit, orderBy, query, startAt, where, type QueryConstraint, } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PublicProfile, RelationshipStatus, SearchProfile, } from "@/lib/schema/types";

export async function searchPublicUsers( activeUid: string, queryUsername: string, limitOverride: boolean, instrumentFilter: string): Promise<SearchProfile[]> {
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

    if (instrumentFilter !== 'all') {
        constraints.push(where('preferredInstrument', '==', instrumentFilter));
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


export async function searchNonCommunityUsers(activeUid: string, queryUsername: string, limitOverride: boolean, communityMembers: string[], instrumentFilter: string): Promise<SearchProfile[]> {
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

    const communityMemberIds = new Set(communityMembers);

    const constraints: QueryConstraint[] = [];

    if (!limitOverride) {
        constraints.push(orderBy("usernameLower"));
        constraints.push(startAt(term));
        constraints.push(endAt(term + "\uf8ff"));
    }

    if (instrumentFilter !== "all") {
        constraints.push(
            where("preferredInstrument", "==", instrumentFilter)
        );
    }

    constraints.push(limit(30));

    const profilesQuery = query(
        collection(db, "publicProfile"),
        ...constraints
    );

    const snapshot = await getDocs(profilesQuery);

    return snapshot.docs
        .map((userDoc) => {
            const profile = userDoc.data() as PublicProfile;
            const uid = profile.uid || userDoc.id;

            if (uid === activeUid || communityMemberIds.has(uid)) {
                return null;
            }

            const candidateFriendIds = new Set(profile.friends ?? []);

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



export async function getFriendProfiles( activeUid: string, friendUids: string[] ): Promise<SearchProfile[]> {
    const uniqueFriendUids = [ ...new Set(friendUids) ].filter(uid => uid !== activeUid);

    if (uniqueFriendUids.length === 0) {
        return [];
    }

    const activeFriendIds = new Set(uniqueFriendUids);

    const snapshots = await Promise.all(
        uniqueFriendUids.map(uid => getDoc(doc(db, "publicProfile", uid)))
    );

    return snapshots
        .filter(snapshot => snapshot.exists())
        .map(snapshot => {
            const profile = snapshot.data() as PublicProfile;
            const candidateFriendIds = new Set(profile.friends ?? []);

            let mutualFriendCount = 0;

            for (const friendUid of candidateFriendIds) {
                if (activeFriendIds.has(friendUid)) {
                    mutualFriendCount++;
                }
            }

            return {
                ...profile,
                relationship: "friend" as RelationshipStatus,
                mutualFriendCount,
            };
        });
}