import type { AppNotification } from "@/lib/schema/types";
import { FriendMatchInvitation } from "./FriendMatchInvitation";

interface NotificationDropdownProps {
    notifications: AppNotification[];
    loading: boolean;
    error: string | null;
    onClose: () => void;
}

export function NotificationDropdown({
    notifications,
    loading,
    error,
    onClose,
}: NotificationDropdownProps) {

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
            {/* Header */}
            <header className="
                flex items-center justify-between
                border-b border-line
                p-4
            ">
                <h2 className="text-lg font-bold text-ink">
                    Notifications
                </h2>

                <button
                    type="button"
                    onClick={onClose}
                    className="text-sm text-muted hover:text-ink"
                >
                    Close
                </button>
            </header>

            {/* Notification list */}
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
                    <div className="flex flex-col items-center gap-2 p-8">
                        <p className="text-2xl">🔔</p>
                        <p className="font-semibold text-ink">
                            You're all caught up!
                        </p>
                        <p className="text-sm text-muted">
                            You don't have any notifications.
                        </p>
                    </div>
                ) : (
                    notifications.map((notification) => {
                        const key =
                            notification.id ?? notification.requestId;

                        if (
                            notification.notificationType ===
                            "friend_match_invitation"
                        ) {
                            return (
                                <div
                                    key={key}
                                    className={
                                        !notification.read
                                            ? "bg-accent-start/10"
                                            : ""
                                    }
                                >
                                    <FriendMatchInvitation
                                        notification={notification}
                                        senderName={notification.notifierUid}
                                    />
                                </div>
                            );
                        }

                        return (
                            <div
                                key={key}
                                className={`
                                    border-b border-line p-4
                                    ${!notification.read ? "bg-accent-start/10" : ""}
                                `}
                            >
                                <p className="font-semibold text-ink">
                                    {notification.notificationType}
                                </p>

                                <p className="mt-1 text-sm text-muted">
                                    You have a new notification.
                                </p>

                                {!notification.read && (
                                    <span className="
                                        mt-2 inline-block
                                        text-xs font-semibold
                                        text-accent-soft
                                    ">
                                        Unread
                                    </span>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}