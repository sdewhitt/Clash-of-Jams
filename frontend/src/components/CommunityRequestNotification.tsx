
import { useEffect, useState } from "react";
import type { AppNotification } from "@/lib/schema/types";
import { acceptCommunityRequest, checkCommunityRequest, declineCommunityRequest, } from "@/lib/communities/communityRequests";
import { deleteNotification, markNotificationRead } from "@/lib/notifications/readNotifications";
import { getFriendName } from "@/lib/friendship/friendRequests";
import { useNavigate } from "react-router";
import { Trash } from "lucide-react";

interface CommunityRequestNotificationProps {
    activeUid: string;
    notification: AppNotification;
}

export function CommunityRequestNotification({activeUid, notification,}: CommunityRequestNotificationProps) {
    const navigate = useNavigate();

    const [senderName, setSenderName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isInvitation = notification.notificationType  === "community_invitation_request_sent";

    const memberUid = isInvitation ? notification.notifierUid : notification.notifiedUid;
    const outsiderUid = isInvitation ? notification.notifiedUid : notification.notifierUid;

    const communityId = notification.requestId.slice(0, -(outsiderUid.length + 1));

    const [requestLoading, setRequestLoading] = useState(false);
    const [requestActive, setRequestActive] = useState(false);

    useEffect(() => {
        if (!communityId || !notification.requestId) {
            setRequestActive(false);
            return;
        }

        let cancelled = false;

        async function loadStatus() {
            setRequestLoading(true);
            setError(null);

            try {
                const activeRequest = await checkCommunityRequest(communityId, notification.requestId);   

                if (!cancelled) {
                    setRequestActive(activeRequest);
                }
            } catch (err) {
                console.error("Failed to load friends:", err);

                if (!cancelled) {
                    setError("Unable to load friends. Please try again.");
                    setRequestActive(false);
                }
            } finally {
                if (!cancelled) {
                    setRequestLoading(false);
                }
            }
        }

        loadStatus();

        return () => {
            cancelled = true;
        };
    }, [communityId, notification.requestId]);

    useEffect(() => {
        let cancelled = false;

        async function fetchSender() {
            try {
                const profile = await getFriendName(
                    notification.notifierUid
                );

                if (!cancelled) {
                    setSenderName(profile.displayName ?? null);
                }
            } catch (err) {
                console.error("Failed to fetch request sender:", err);

                if (!cancelled) {
                    setError("Unable to load request information.");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        fetchSender();

        return () => {
            cancelled = true;
        };
    }, [notification.notifierUid]);

    async function handleAccept() {
        if (processing) return;

        try {
            setProcessing(true);
            setError(null);

            await acceptCommunityRequest(communityId, activeUid, memberUid, outsiderUid);
            await deleteNotification(notification.id ?? "");
        } catch (err) {
            console.error("Failed to accept community request:", err);

            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to accept community request."
            );
        } finally {
            setProcessing(false);
        }
    }

    async function handleDecline() {
        if (processing) return;

        try {
            setProcessing(true);
            setError(null);

            await declineCommunityRequest(communityId, activeUid, memberUid, outsiderUid);
            await deleteNotification(notification.id ?? "");
        } catch (err) {
            console.error("Failed to decline community request:", err);

            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to decline community request."
            );
        } finally {
            setProcessing(false);
        }
    }

    async function handleDismiss() {
        if (processing) return;

        try {
            await deleteNotification(notification.id ?? "");
        } catch (err) {
            console.error("Failed to delete notification:", err);
            setError("Unable to dismiss notification.");
        }
    }

    if (loading) {
        return (
            <div className="flex h-full flex-row items-center bg-linear-to-b from-contrast-start from-50 via-contrast-middle to-contrast-end to-70 brightness-80  justify-center gap-4">
                <div className="h-8 w-8 animate-spin rounded-full border-6 border-accent-start border-t-transparent"></div>
                <p className="text-center text-2xl py-4">
                    Loading notifications data...
                </p>
            </div>
        );
    }

    switch(notification.notificationType) {
        case "community_invitation_request_sent":
            return (
                <div 
                    className={`
                        flex flex-col gap-4
                        bg-linear-to-b
                        from-contrast-start from-50
                        via-contrast-middle
                        to-contrast-end to-70
                        brightness-80
                        border-b border-line
                        hover:brightness-110
                    `}
                >
                    <div
                        className={`
                            w-full 
                            flex flex-row 
                            gap-3 p-4
                        `}
                    >
                        <button
                            type="button"
                            aria-label="Delete notification"
                            disabled={!notification.id}
                            onClick={() => handleDismiss()}
                            className="notification-delete grid size-9 place-items-center self-center rounded-md text-inverse-ink hover:bg-accent-middle/30 hover:text-accent-middle"
                        >
                            <Trash className="notification-delete-icon" size={24} aria-hidden="true" />
                        </button>
                    
                        <div
                            onClick={() => {
                                markNotificationRead(notification.id ?? "");
                                navigate('/social/my_communities');
                            }} 
                            className="flex flex-1 flex-row justify-between"
                        >
                            <div className="flex flex-1 flex-col gap-2">
                                <div>
                                    <p className="font-semibold text-ink">
                                        {`${senderName ?? "Someone"} invited you to join their community!`}
                                    </p>
                
                                    <p className="text-sm text-inverse-ink">
                                        Notification Sent: {notification.createdAt?.toDate().toLocaleDateString()}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-1 flex-row items-center justify-end gap-4">
                                <div
                                    className={`
                                        rounded-full
                                        bg-radial
                                        from-accent-start
                                        via-accent-middle
                                        to-accent-end
                                        outline-4
                                        brightness-110
                                        opacity-85
                                        px-4 py-2
                                        ${notification.read ? "outline-accent-start" : "animate-pulse outline-ink"}
                                    `}
                                >
                                    {notification.read ? "Read" : "Unread"}
                                </div>
                                        
                                {requestLoading && (
                                    <div
                                        className="
                                            rounded-lg
                                            flex flex-row
                                            bg-linear-to-r from-emerald-600 to-green-500
                                            border-2 border-ink
                                            hover:from-emerald-500 hover:to-green-400
                                            text-white
                                            disabled:opacity-50
                                            px-6 py-2
                                        "
                                    >
                                        <div className="h-8 w-8 animate-spin rounded-full border-6 border-accent-start border-t-transparent"></div>
                                        <p className="text-center text-2xl py-4">
                                            Loading request status...
                                        </p>
                                    </div>
                                )}

                                {!requestLoading && requestActive && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                handleAccept()
                                            }}
                                            disabled={processing}
                                            className="
                                                rounded-lg
                                                bg-linear-to-r from-emerald-600 to-green-500
                                                border-2 border-ink
                                                hover:from-emerald-500 hover:to-green-400
                                                text-white
                                                disabled:opacity-50
                                                px-6 py-2
                                            "
                                        >
                                            {processing ? "Processing..." : "Accept"}
                                        </button>
                
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                handleDecline()
                                            }}
                                            disabled={processing}
                                            className="
                                                rounded-lg
                                                bg-linear-to-r from-red-700 to-rose-600
                                                border-2 border-ink
                                                hover:from-red-600 hover:to-rose-500
                                                text-white
                                                disabled:opacity-50
                                                px-6 py-2
                                            "
                                        >
                                            Decline
                                        </button>
                                    </>
                                )}
                                <span 
                                    id="navigate_to_pending_communities"
                                    className="ml-4 text-2xl text-inverse-ink"
                                >
                                    →
                                </span>
                            </div>
                        </div>
                    </div>
                    {error && (
                        <p role="alert" className="text-sm text-accent-start">
                            {error}
                        </p>
                    )}
                </div>
            );
        case "community_knock_request_accepted":
            return (
                <div
                    className={`
                        w-full 
                        flex flex-row 
                        gap-3 p-4
                        bg-linear-to-b
                        from-contrast-start from-50
                        via-contrast-middle
                        to-contrast-end to-70
                        brightness-80
                        border-b border-line
                        hover:brightness-110
                    `}
                >
                    <button
                        type="button"
                        aria-label="Delete notification"
                        disabled={!notification.id}
                        onClick={() => handleDismiss()}
                        className="notification-delete grid size-9 place-items-center self-center rounded-md text-inverse-ink hover:bg-accent-middle/30 hover:text-accent-middle"
                    >
                        <Trash className="notification-delete-icon" size={24} aria-hidden="true" />
                    </button>
                
                    <div
                        onClick={() => {
                            markNotificationRead(notification.id ?? "");
                            () => navigate(`/community/${communityId}`);
                        }} 
                        className="flex flex-1 flex-row items-center justify-between"
                    >
                        <p 
                            className="font-semibold text-ink"
                        >
                            {`${senderName ?? "Someone"} accepted your request to join their community!`}
                        </p>

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
                    </div>
                </div>
            );
        case "community_knock_request_declined":
            return (
                <div
                    className={`
                        w-full 
                        flex flex-row 
                        gap-3 p-4
                        bg-linear-to-b
                        from-contrast-start from-50
                        via-contrast-middle
                        to-contrast-end to-70
                        brightness-80
                        border-b border-line
                        hover:brightness-110
                    `}
                >
                    <button
                        type="button"
                        aria-label="Delete notification"
                        disabled={!notification.id}
                        onClick={() => handleDismiss()}
                        className="notification-delete grid size-9 place-items-center self-center rounded-md text-inverse-ink hover:bg-accent-middle/30 hover:text-accent-middle"
                    >
                        <Trash className="notification-delete-icon" size={24} aria-hidden="true" />
                    </button>
                
                    <div
                        onClick={() => {
                            markNotificationRead(notification.id ?? "");
                            () => navigate('/social/find_communities');
                        }} 
                        className="flex flex-1 flex-row items-center justify-between"
                    >
                        <p 
                            className="font-semibold text-ink"
                        >
                            {`${senderName ?? "Someone"} declined your request to join their community!`}
                        </p>

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
                    </div>
                </div>
            );
        default:
            return null;
    }
}
