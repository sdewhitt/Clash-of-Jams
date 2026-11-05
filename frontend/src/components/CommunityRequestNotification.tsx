
import { useEffect, useState } from "react";
import type { AppNotification } from "@/lib/schema/types";
import { acceptCommunityRequest, declineCommunityRequest, getFriendName, } from "@/lib/communities/communityRequests";
import { deleteNotification } from "@/lib/notifications/readNotifications";

interface CommunityRequestNotificationProps {
    activeUid: string;
    notification: AppNotification;
}

type CommunityRequestType =
    | "community_invitation_request_sent"
    | "community_knock_request_sent";

export function CommunityRequestNotification({activeUid, notification,}: CommunityRequestNotificationProps) {
    const [senderName, setSenderName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const requestType = notification.notificationType as CommunityRequestType;

    const isInvitation = requestType === "community_invitation_request_sent";
    const isKnock = requestType === "community_knock_request_sent";

    const memberUid = isInvitation
        ? notification.notifierUid
        : notification.notifiedUid;

    const outsiderUid = isInvitation
        ? notification.notifiedUid
        : notification.notifierUid;

    const communityId = notification.requestId.slice(0, -(outsiderUid.length + 1));

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
            <p className="bg-surface border-b border-line text-sm text-ink p-4">
                Loading...
            </p>
        );
    }

    if (!isInvitation && !isKnock) {
        return null;
    }

    return (
        <div
            className="
                w-full flex flex-row gap-3 p-4
                bg-linear-to-b
                from-contrast-start from-50
                via-contrast-middle
                to-contrast-end to-70
                brightness-80
                border-b border-line
                hover:brightness-110
            "
        >
            <button
                type="button"
                onClick={handleDismiss}
                disabled={processing}
                className="text-2xl text-muted"
                aria-label="Dismiss notification"
            >
                X
            </button>

            <div className="flex flex-col flex-1 gap-2">
                <div>
                    <p className="font-semibold text-ink">
                        {isInvitation
                            ? `${senderName ?? "Someone"} invited you to join their community!`
                            : `${senderName ?? "Someone"} wants to join your community!`}
                    </p>

                    {!notification.read && (
                        <p className="mt-1 text-sm text-inverse-ink">
                            {isInvitation
                                ? "Would you like to join this community?"
                                : "Would you like to accept this member into your community?"}
                        </p>
                    )}
                </div>

                {error && (
                    <p role="alert" className="text-sm text-red-400">
                        {error}
                    </p>
                )}

                {!notification.read && (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={handleAccept}
                            disabled={processing}
                            className="
                                flex-1 rounded-lg
                                bg-accent-start
                                border border-line
                                font-semibold text-ink
                                hover:brightness-110
                                disabled:opacity-50
                                px-3 py-2
                            "
                        >
                            {processing ? "Processing..." : "Accept"}
                        </button>

                        <button
                            type="button"
                            onClick={handleDecline}
                            disabled={processing}
                            className="
                                flex-1 rounded-lg
                                bg-accent-start
                                border border-line
                                font-semibold text-ink
                                hover:bg-base
                                disabled:opacity-50
                                px-3 py-2
                            "
                        >
                            Decline
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
