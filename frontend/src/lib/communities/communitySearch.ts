import { collection, doc, endAt, getDoc, getDocs, limit, orderBy, query, startAt, where, type QueryConstraint, } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Community, } from "@/lib/schema/types";

export async function searchCommunities( activeUid: string, queryName: string, limitOverride: boolean): Promise<Community[]> {
    const term = queryName.trim().toLowerCase();

    if (!limitOverride && term.length < 3) {
        return [];
    }

    const activeProfileRef = doc(db, "publicProfile", activeUid);
    const activeProfileSnap = await getDoc(activeProfileRef);

    if (!activeProfileSnap.exists()) {
        return [];
    }

    const constraints: QueryConstraint[] = [
        limit(30),
    ];

    if (!limitOverride) {
        constraints.push(orderBy('usernameLower'));
        constraints.push(startAt(term));
        constraints.push(endAt(term + "\uf8ff"));
    }
    
    const communitiesQuery = query(
        collection(db, "communities"),
        ...constraints
    );

    const snapshot = await getDocs(communitiesQuery);

    return snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
    })) as Community[];
}

export async function getMyCommunities( communityIds: string[] ): Promise<Community[]> {
    const uniqueCommunityIds = [...new Set(communityIds)];

    if (uniqueCommunityIds.length === 0) {
        return [];
    }

    const communitiesRef = collection(db, "communities");
    const communitiesQuery = query( communitiesRef, where("__name__", "in", uniqueCommunityIds));
    const snapshot = await getDocs(communitiesQuery);

    return snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
    })) as Community[];
}