import { useEffect, useState } from "react";
import { getFriendName } from "@/lib/friendship/friendRequests";
import { useNavigate } from "react-router";
import { markNotificationRead } from "@/lib/notifications/readNotifications";
import { deleteNotification } from "@/lib/notifications/readNotifications";
import type { AppNotification } from "@/lib/schema/types";
import { Trash } from "lucide-react";

interface FriendRequestNotificationProps {
    notification: AppNotification;
    activeUid: string;
}

export function FriendRequestNotification({ notification, activeUid, }: FriendRequestNotificationProps) {
    const navigate = useNavigate();

    const [friendUid, setFriendUid] = useState<string | null>(null);
    const [friendName, setFriendName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    async function handleNotificationClick() {
        markNotificationRead(notification.id ?? "");
        navigate(`/profile/${friendUid}`);
    }

    useEffect(() => {
        let cancelled = false;

        async function fetchFriend() {
            try {
                const friendNameReq = await getFriendName(notification.notifierUid);

                if (!cancelled) {
                    setFriendUid(notification.notifierUid);
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
    }, [notification.requestId, activeUid]);

    if (loading) {
        return (
            <div className="flex h-full flex-row items-center bg-linear-to-b from-contrast-start from-50 via-contrast-middle to-contrast-end to-70 brightness-80  justify-center gap-4">
                <div className="h-8 w-8 animate-spin rounded-full border-6 border-accent-start border-t-transparent"></div>
                <p className="text-center text-2xl py-4">
                    Loading friend request data...
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-full flex-row items-center bg-linear-to-b from-contrast-start from-50 via-contrast-middle to-contrast-end to-70 brightness-80  justify-center gap-4">
                <p className="p-4 text-center text-4xl text-accent-start" role="alert">{error}</p>
            </div>
        );
    }

    return (
        <div
            className={`
                w-full
                flex flex-row
                bg-linear-to-b
                from-contrast-start from-50
                via-contrast-middle
                to-contrast-end to-70
                brightness-80     
                border-b border-line 
                gap-4
                p-4
                hover:brightness-110
            `}
        >
            <button
                type="button"
                aria-label="Delete notification"
                disabled={!notification.id}
                onClick={() => {
                    if (notification.id) void deleteNotification(notification.id);
                }}
                className="notification-delete grid size-9 place-items-center self-center rounded-md text-inverse-ink hover:bg-accent-middle/30 hover:text-accent-middle"
            >
                <Trash className="notification-delete-icon" size={24} aria-hidden="true" />
            </button>
            <button 
                type="button"
                onClick={() => handleNotificationClick()}
                className="flex flex-1 flex-row justify-between"
            >
                <div className="flex flex-1 flex-col items-start justify-center">
                    {notification.notificationType === 'friend_request_sent' && (
                        <p className="font-semibold text-ink">
                            {friendName} sent you a friend request
                        </p>
                    )}

                    {notification.notificationType  === 'friend_request_accepted' && (
                        <p className="font-semibold text-ink">
                            {friendName} accepted your friend request
                        </p>
                    )}

                    {notification.notificationType  === 'friend_request_canceled' && (
                        <p className="font-semibold text-ink">
                            {friendName} canceled their friend request
                        </p>
                    )}

                    {notification.notificationType  === 'friend_request_declined' && (
                        <p className="font-semibold text-ink">
                            {friendName} declined your friend request
                        </p>
                    )}

                    <p className="text-sm text-inverse-ink">
                        Notification Sent: {notification.createdAt?.toDate().toLocaleDateString()}
                    </p>
                </div>
                
                <div className="flex flex-1 flex-row gap-4 items-center justify-end">
                    <div
                        className={`
                            rounded-full
                            bg-radial
                            from-accent-start
                            via-accent-middle
                            to-accent-end
                            outline-4
                            brightness-120
                            opacity-85
                            px-4 py-2
                            ${notification.read ? "outline-accent-start" : "animate-pulse outline-ink"}
                        `}
                    >
                        {notification.read ? "Read" : "Unread"}
                    </div>
                    <span 
                        id="navigate_to_user"
                        className="text-2xl text-inverse-ink"
                    >
                        →
                    </span>
                </div>
            </button>
        </div>
    );
}