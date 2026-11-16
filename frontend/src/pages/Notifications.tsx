import { BackButton } from "@/components/BackButton";
import { CommunityRequestNotification } from "@/components/CommunityRequestNotification";
import { FriendMatchInvitation } from "@/components/FriendMatchInvitation";
import { FriendRequestNotification } from "@/components/FriendRequestNotification";
import { LiveElo } from "@/components/LiveElo";
import { ProfileButton } from "@/components/ProfileButton";
import { useAuth } from "@/lib/auth/useAuth";
// import { deleteNotification } from "@/lib/notifications/readNotifications";
import { useNotifications } from "@/lib/notifications/useNotifications";
import { Bell } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

export function Notifications() {
    const { user, profile, loading } = useAuth()
    const navigate = useNavigate()
    const { notifications, unreadCount, loading: notificationLoading, error } = useNotifications(profile?.uid ?? "");

    const [ readView, setReadView ] = useState<"all" | "unread" | "read">("all");
    const [ notificationType, setNotificationType ] = useState<"all" | "friendRequests" | "communityRequests" | "friendMatch" | "communityMatch">("all");
    const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

    const filteredNotifications = notifications.filter((notification) => {
        const matchesReadView =
            readView === "all" ||
            (readView === "read" && notification.read) ||
            (readView === "unread" && !notification.read);
        
        const matchesType =
            notificationType === "all" ||
            (notificationType === "friendRequests" &&
            notification.notificationType.startsWith("friend_request_")) ||
            (notificationType === "communityRequests" &&
            (notification.notificationType.startsWith("community_knock_request_") || notification.notificationType.startsWith("community_invitation_request_"))) ||
            (notificationType === "friendMatch" && 
            notification.notificationType.startsWith("friend_match_")) ||
            (notificationType === "communityMatch" &&
            notification.notificationType.startsWith("community_match_"));
        
        return matchesReadView && matchesType;
    });

    const sortedNotifications = sortOrder === "oldest" ? [...filteredNotifications].reverse() : filteredNotifications;

    if (loading) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4">
                <div className="h-32 w-32 animate-spin rounded-full border-10 border-accent-start border-t-transparent"></div>
                <p className="text-center text-4xl py-4">
                    Loading your profile...
                </p>
            </div>
        );
    }

    return (
        <main className="h-screen flex flex-col overflow-hidden">
            <header className="flex items-center justify-between bg-linear-to-r from-accent-base-start from-10% via-accent-base-middle via-70% to-accent-base-end to-90% border-b-4 border-accent-start py-6">
                <div className="flex ml-12">
                    <BackButton onClick={() => navigate(-1)}></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">Your Notifications</h1>
                </div>
                <div className="ml-auto flex items-center gap-3 sm:gap-4 mr-12">
                    <LiveElo />
                    <ProfileButton
                    className="w-36 shrink-0 sm:w-50"
                    username={profile?.displayName ?? user?.email ?? '…'}
                    userAvatar={profile?.avatarUrl ?? '../../favicon.svg'}
                    />
                </div>
            </header>

            {notificationLoading && (
                <div className="flex h-full flex-col items-center justify-center gap-4">
                    <div className="h-32 w-32 animate-spin rounded-full border-10 border-accent-start border-t-transparent"></div>
                    <p className="text-center text-4xl py-4">
                        Loading notifications...
                    </p>
                </div>
            )}

            {error && (
                <p role="alert" className="py-4 text-center">
                    {error}
                </p>
            )}

            {!notificationLoading && !error && (
                <div
                    className={`
                        w-auto h-full
                        overflow-auto
                        flex flex-col
                        rounded-4xl
                        bg-radial
                        from-accent-base-start
                        via-accent-base-middle
                        to-accent-base-end
                        outline-4 outline-accent-start
                        m-12
                    `}
                >
                    <div
                        className={`
                            flex flex-row
                            justify-center
                            gap-8
                            bg-radial
                            from-accent-start
                            via-accent-middle
                            to-accent-end
                            border-b-4 border-accent-start
                            px-6 py-4
                        `}
                    >
                        <div className="flex flex-row overflow-contain outline-4 outline-contrast-start rounded-lg m-2">
                            <button
                                type="button"
                                aria-pressed={readView === "all"}
                                onClick={() => setReadView("all")}
                                className={`
                                    rounded-l-lg
                                    bg-radial 
                                    from-contrast-start 
                                    via-contrast-middle 
                                    to-contrast-end
                                    text-xl text-inverse-ink
                                    brightness-80
                                    aria-pressed:brightness-100
                                    px-4 py-2
                                `}
                            >
                                All Notifications ({notifications.length})
                            </button>
                            <button
                                type="button"
                                aria-pressed={readView === "unread"}
                                onClick={() => setReadView("unread")}
                                className={`
                                    bg-radial 
                                    from-contrast-start 
                                    via-contrast-middle 
                                    to-contrast-end
                                    text-xl text-inverse-ink
                                    brightness-80 
                                    aria-pressed:brightness-100
                                    px-4 py-2
                                `}
                            >
                                Unread Notifications ({unreadCount})
                            </button>
                            <button
                                type="button"
                                aria-pressed={readView === "read"}
                                onClick={() => setReadView("read")}
                                className={`
                                    rounded-r-lg
                                    bg-radial 
                                    from-contrast-start 
                                    via-contrast-middle 
                                    to-contrast-end
                                    text-xl text-inverse-ink
                                    brightness-80
                                    aria-pressed:brightness-100
                                    px-4 py-2
                                `}
                            >
                                Read Notifications ({notifications.length - unreadCount})
                            </button>
                        </div>
                        <div className="w-1/5 flex flex-col gap-2 m-2">
                            <label
                                htmlFor="notificationTypeFilter"
                                className="
                                    text-lg
                                    text-ink
                                    font-bold
                                "
                            >
                                Notification Type:
                            </label>
                            <select
                                id="notificationTypeFilter"
                                name="notificationType"
                                value={notificationType}
                                onChange={(event) => {
                                    const value = event.currentTarget.value;
                                    
                                    if (value === "all" || value === "friendRequests" || value === "communityRequests" || value === "friendMatch" || value === "communityMatch") {
                                        setNotificationType(value);
                                    }
                                }}
                                required
                                className={`
                                    px-2 py-4
                                    rounded-lg
                                    bg-radial
                                    from-contrast-start
                                    via-contrast-middle
                                    to-contrast-end
                                    text-xl text-inverse-ink
                                    outline-2
                                    outline-contrast-start
                                    focus:outline-none
                                    focus:ring-3
                                    focus:ring-contrast-end
                                    transition-all
                                `}
                            >
                                <option className="text-lg text-center text-ink" value="all">All Notifications</option>
                                <option className="text-lg text-center text-ink" value="friendRequests">Friend Requests</option>
                                <option className="text-lg text-center text-ink" value="communityRequests">Community Requests</option>
                                <option className="text-lg text-center text-ink" value="friendMatch">Friendly Matches</option>
                                <option className="text-lg text-center text-ink" value="communityMatch">Community Matches</option>
                            </select>
                        </div>
                        <div className="w-1/5 flex flex-col gap-2 m-2">
                            <label
                                htmlFor="notificationSortOrder"
                                className="
                                    text-lg
                                    text-ink
                                    font-bold
                                "
                            >
                                Notification Order:
                            </label>
                            <select
                                id="notificationSortOrder"
                                name="notificationOrder"
                                value={sortOrder}
                                onChange={(event) => {
                                    const value = event.currentTarget.value;
                                    if (value === "newest" || value === "oldest") {
                                    setSortOrder(value);
                                    }
                                }}
                                required
                                className={`
                                    px-2 py-4
                                    rounded-lg
                                    bg-radial
                                    from-contrast-start
                                    via-contrast-middle
                                    to-contrast-end
                                    text-xl text-inverse-ink
                                    outline-2
                                    outline-contrast-start
                                    focus:outline-none
                                    focus:ring-3
                                    focus:ring-contrast-end
                                    transition-all
                                `}
                            >
                                <option className="text-lg text-center text-ink" value="newest">Newest first</option>
                                <option className="text-lg text-center text-ink" value="oldest">Oldest first</option>
                            </select>
                        </div>
                    </div>

                    {notifications.length === 0 && (
                        <div className={`
                            flex flex-1 flex-col
                            items-center justify-center
                            gap-2 p-8
                        `}>
                            <Bell size={136}/>
                            <p className="font-semibold text-4xl text-ink">
                                You're all caught up!
                            </p>
                            <p className="text-xl text-muted">
                                You don't have any notifications.
                            </p>
                        </div>
                    )}

                    {notifications.length > 0 && (
                        <div className="overflow-y-auto overscroll-contain">
                            {sortedNotifications.length > 0 && (
                                sortedNotifications.map((notification) => {
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
                                                activeUid={profile?.uid ?? ""} 
                                                notification={notification}
                                            />
                                        );
                                    }
                                    else if (notification.notificationType.includes("community") && notification.notificationType.includes("request")) {
                                        return (
                                            <CommunityRequestNotification
                                                key={key}
                                                activeUid={profile?.uid ?? ""}
                                                notification={notification}
                                            />
                                        );
                                    }
                                })
                            )}

                            {sortedNotifications.length == 0 && (
                                <div className="flex flex-col items-center gap-2">
                                    <p className="text-center text-2xl py-4">
                                        No notifications found. Try different search criteria.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setReadView("all")
                                            setNotificationType("all")
                                            setSortOrder("newest")
                                        }}
                                        className={`
                                            rounded-lg
                                            px-6 py-4
                                            bg-linear-to-b
                                            from-contrast-start
                                            via-contrast-middle
                                            to-contrast-end
                                            border-2 border-contrast-start
                                            text-ink
                                            hover:scale-102
                                            hover:brightness-120
                                            active:scale-99
                                            active:opacity-30%
                                            active:brightness-60
                                            transition
                                            duration-200
                                        `}
                                    >
                                        Clear Search Criteria
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </main>
    );
}