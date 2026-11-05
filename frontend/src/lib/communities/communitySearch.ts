import { collection, doc, endAt, getDoc, getDocs, limit, orderBy, query, startAt, where, type QueryConstraint, } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { type CommunityMembership, type Community, } from "@/lib/schema/types";
import { COLLECTIONS, communityMembersPath } from "@/lib/schema/collections";

interface CommunityInformation {
    community: Community;
    members: CommunityMembership[];
}

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

    const userCommunities = activeProfileSnap.data().communities

    if (userCommunities.length > 0) {
        constraints.push(where("__name__", "not-in", userCommunities))
    }

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
    if (communityIds.length === 0) {
        return [];
    }

    const communitiesRef = collection(db, "communities");
    const communitiesQuery = query(communitiesRef, where("__name__", "in", communityIds));
    const snapshot = await getDocs(communitiesQuery);

    return snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
    })) as Community[];
}

export async function getCommunityInformation( communityId: string ): Promise<CommunityInformation | null> {
    const communityRef = doc(db, COLLECTIONS.communities, communityId);
    const communityMembershipRef = collection(db, communityMembersPath(communityId));

    const [communitySnap, membersSnap] = await Promise.all([
        getDoc(communityRef),
        getDocs(communityMembershipRef),
    ]);

    if (!communitySnap.exists()) {
        return null;
    }

    const community = {
        id: communitySnap.id,
        ...communitySnap.data(),
    } as Community;

    const members = membersSnap.docs.map((memberDoc) => ({
        uid: memberDoc.id,
        ...memberDoc.data(),
    })) as CommunityMembership[];

    return { community, members, };
}