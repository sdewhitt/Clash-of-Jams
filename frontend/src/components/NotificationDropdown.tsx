import type { AppNotification } from "@/lib/schema/types";
import { FriendMatchInvitation } from "./FriendMatchInvitation";
import { FriendRequestNotification } from "./FriendRequestNotification";
import { CommunityRequestNotification } from "./CommunityRequestNotification";
import { deleteNotification } from "@/lib/notifications/readNotifications";

interface NotificationDropdownProps {
    uid: string;
    notifications: AppNotification[];
    loading: boolean;
    error: string | null;
    onClose: () => void;
}

export function NotificationDropdown({ uid, notifications, loading, error, onClose, }: NotificationDropdownProps) {

    return (
        <div
            className="
                absolute right-0 top-full z-50 mt-3
                w-80 sm:w-96
                overflow-hidden
                rounded-xl
                border border-line
                bg-surface
                shadow-2xl
            "
        >
            <header className="
                flex items-center 
                justify-between
                bg-linear-to-b
                from-contrast-start from-50
                via-contrast-middle
                to-contrast-end to-70
                border-b border-line
                p-4 
            ">
                <h2 
                    className="text-lg font-bold text-ink"
                >
                    Notifications
                </h2>

                <button
                    type="button"
                    onClick={onClose}
                    className="text-sm text-ink hover:text-muted"
                >
                    Close
                </button>
            </header>

            <div className="max-h-96 overflow-y-auto">

                {loading ? (
                    <p className="p-6 text-center text-sm text-muted">
                        Loading notifications...
                    </p>
                ) : error ? (
                    <p
                        role="alert"
                        className="p-6 text-center text-sm text-red-400"
                    >
                        {error}
                    </p>
                ) : notifications.length === 0 ? (
                    <div className={`
                        flex flex-col 
                        items-center
                        bg-linear-to-b
                        from-contrast-start from-50
                        via-contrast-middle
                        to-contrast-end to-70
                        brightness-80
                        gap-2 p-8
                    `}>
                        <p className="text-2xl">🔔</p>
                        <p className="font-semibold text-ink">
                            You're all caught up!
                        </p>
                        <p className="text-sm text-inverse-ink">
                            You don't have any notifications.
                        </p>
                    </div>
                ) : (
                    notifications.map((notification) => {
                        const key = notification.id ?? notification.requestId;

                        if (notification.notificationType === "friend_match_invitation") {
                            return (
                                <FriendMatchInvitation
                                    key={key}
                                    notification={notification}
                                />
                            );
                        }
                        else if (notification.notificationType.includes("friend_request")) {
                            return (
                                <FriendRequestNotification 
                                    key={key}
                                    notificationId={notification.id ?? ""}
                                    notificationType={notification.notificationType}
                                    notifierUid={notification.notifierUid}
                                    requestId={notification.requestId} 
                                    uid={uid} 
                                    read={notification.read}
                                />
                            );
                        }
                        else if (notification.notificationType.includes("community") && notification.notificationType.includes("request_sent")) {
                            return (
                                <CommunityRequestNotification
                                    key={key}
                                    activeUid={uid}
                                    notification={notification}
                                />
                            );
                        }
                        else if (notification.notificationType.includes("community") && notification.notificationType.includes("request_accepted")) {
                            return (
                                <div
                                    onClick={() => deleteNotification(notification.id ?? "")}
                                    className="
                                        w-full
                                        flex flex-row
                                        bg-linear-to-b
                                        from-contrast-start from-50
                                        via-contrast-middle
                                        to-contrast-end to-70
                                        brightness-80
                                        border-b border-line
                                        hover:brightness-110
                                        gap-4
                                    "
                                >
                                    <p>x</p>
                                    <p>
                                        {notification.notifierUid} accepted the invitation to your community
                                    </p>
                                </div>
                            );
                        }
                        else if (notification.notificationType.includes("community") && notification.notificationType.includes("request_declined")) {
                            return (
                                <div
                                    onClick={() => deleteNotification(notification.id ?? "")}
                                    className="
                                        w-full
                                        flex flex-row
                                        bg-linear-to-b
                                        from-contrast-start from-50
                                        via-contrast-middle
                                        to-contrast-end to-70
                                        brightness-80
                                        border-b border-line
                                        hover:brightness-110
                                        gap-4
                                    "
                                >
                                    <p>x</p>
                                    <p>
                                        {notification.notifierUid} declined the invitation to your community
                                    </p>
                                </div>
                            )
                        }
                    })
                )}
            </div>
        </div>
    );
}