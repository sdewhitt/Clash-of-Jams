import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { communityAnnouncementsPath, newCommunityAnnouncement } from "@/lib/schema/collections";
import type { CommunityAnnouncement, CommunityRole } from "@/lib/schema/types";

export type CommunityNotification = {
    id: string;
    data: CommunityAnnouncement;
};

export async function deleteCommunityNotification(communityId: string, notificationId: string) {
    const notificationRef = doc(db, communityAnnouncementsPath(communityId), notificationId);
    await deleteDoc(notificationRef);
}

export async function createCommunityNotification(communityId: string, announcerUid: string, announcementTitle: string, announcement: string, announcementViewers: CommunityRole[]) {
    const communityAnnouncementsRef = collection(db, communityAnnouncementsPath(communityId));
    const communityAnnouncementRef = doc(communityAnnouncementsRef);

    await setDoc(communityAnnouncementRef, newCommunityAnnouncement({announcerUid: announcerUid, announcementTitle: announcementTitle, announcement: announcement, announcementViewers: announcementViewers}));
}

export function subscribeCommunityNotifications(communityId: string, memberRole: CommunityRole, onUpdate: (notifications: CommunityNotification[]) => void, onError?: (error: Error) => void) {
    const announcementsRef = collection(db, communityAnnouncementsPath(communityId));

    const announcementsQuery = query(announcementsRef, where("announcementViewers", "array-contains", memberRole), orderBy("postedAt", "desc"));

    return onSnapshot(
        announcementsQuery,
        (snapshot) => {
            const notifications: CommunityNotification[] =
                snapshot.docs.map((announcementDoc) => ({
                    id: announcementDoc.id,
                    data: announcementDoc.data() as CommunityAnnouncement
                }));

            onUpdate(notifications);
        },
        onError
    );
}