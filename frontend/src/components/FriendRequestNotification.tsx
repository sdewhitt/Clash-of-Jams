import { useEffect, useState } from "react";
import { getFriendName } from "@/lib/friendship/friendRequests";
import { useNavigate } from "react-router";
import { markNotificationRead } from "@/lib/notifications/readNotifications";

interface FriendRequestNotificationProps {
    notificationId: string;
    notificationType: string;
    notifierUid: string;
    requestId: string;
    uid: string;
    read: boolean;
}

export function FriendRequestNotification({ notificationId, notificationType, notifierUid, requestId, uid, read, }: FriendRequestNotificationProps) {
    const [friendUid, setFriendUid] = useState<string | null>(null);
    const [friendName, setFriendName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    async function handleNotificationClick() {
        markNotificationRead(notificationId);
        navigate(`/profile/${friendUid}`);
    }

    useEffect(() => {
        let cancelled = false;

        async function fetchFriend() {
            try {
                const friendNameReq = await getFriendName(notifierUid);

                if (!cancelled) {
                    setFriendUid(notifierUid ?? null);
                    setFriendName(friendNameReq.displayName ?? null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError("Unable to load friend request.");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        fetchFriend();

        return () => {
            cancelled = true;
        };
    }, [requestId, uid]);

    if (loading) {
        return <p className="p-4 text-sm text-muted">Loading...</p>;
    }

    if (error) {
        return <p className="p-4 text-sm text-red-400">{error}</p>;
    }

    return (
        <button 
            type="button"
            onClick={() => handleNotificationClick()}
            className={`
                group
                w-full
                flex flex-row
                justify-between
                bg-linear-to-b
                from-contrast-start from-50
                via-contrast-middle
                to-contrast-end to-70
                brightness-80
                border-b border-line 
                gap-2
                p-4
                hover:brightness-110
            `}
        >
            <div className="flex flex-col">
                {notificationType === 'friend_request_sent' && (
                    <p className="font-semibold text-ink">
                        {friendName} sent you a friend request
                    </p>
                )}

                {notificationType === 'friend_request_accepted' && (
                    <p className="font-semibold text-ink">
                        {friendName} accepted your friend request
                    </p>
                )}

                {notificationType === 'friend_request_canceled' && (
                    <p className="font-semibold text-ink">
                        {friendName} canceled their friend request
                    </p>
                )}

                {notificationType === 'friend_request_declined' && (
                    <p className="font-semibold text-ink">
                        {friendName} declined your friend request
                    </p>
                )}

                {!read && (
                    <span className="mt-2 inline-block text-xs font-semibold text-accent-soft">
                        Unread
                    </span>
                )}
            </div>

            <span className="text-2xl text-inverse-ink group-hover:text-muted" aria-hidden="true">
                →
            </span>
        </button>
    );
}