import { useEffect, useState } from "react";
import type { AppNotification } from "@/lib/schema/types";
import { declineFriendMatchInvitation } from "@/lib/matchmaking/gameInvitations";
import { ChallengeFriendDialog } from "./ChallengeFriendDialog";
import { getFriendName } from "@/lib/friendship/friendRequests";
import { deleteNotification } from "@/lib/notifications/readNotifications";

interface FriendMatchInvitationProps {
    notification: AppNotification;
}

export function FriendMatchInvitation({ notification, }: FriendMatchInvitationProps) {
    const [friendName, setFriendName] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const [showDialog, setShowDialog] = useState(false);
    const [declining, setDeclining] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleDecline() {
        if (declining) return;

        try {
            setDeclining(true);
            setError(null);

            await declineFriendMatchInvitation({ invitationId: notification.requestId, });
        } catch (err) {
            console.error("Failed to decline invitation:", err);

            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to decline invitation."
            );
        } finally {
            setDeclining(false);
        }
    }

    async function handleNotificationDeletion(){
        void handleDecline();
        deleteNotification(notification.id ?? "")
    }

    async function handleInteraction(mode: string) {
        if (mode === 'accept') {
            setShowDialog(true);
        }
        else {
            void handleDecline();
        }
    }

    useEffect(() => {
        let cancelled = false;

        async function fetchFriend() {
            try {
                const friendNameReq = await getFriendName(notification.notifierUid);

                if (!cancelled) {
                    setFriendName(friendNameReq.displayName ?? null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError("Unable to load friend name.");
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
    }, [notification]);

    if (loading) {
        return <p className={`
            bg-linear-to-b
            from-contrast-start from-50
            via-contrast-middle
            to-contrast-end to-70
            brightness-80
            border-b border-line 
            text-sm text-ink
            p-4
        `}>
            Loading...
        </p>;
    }

    if (error) {
        return <p className={`
            bg-linear-to-b
            from-contrast-start from-50
            via-contrast-middle
            to-contrast-end to-70
            brightness-80
            border-b border-line 
            text-sm text-ink
            p-4
        `}>
            {error}
        </p>;
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
                gap-3
                p-4
                hover:brightness-110
            `}
        >
            <button
                id="delete_notification"
                type="button"
                onClick={() => handleNotificationDeletion()}
                className={`
                    text-2xl text-inverse-ink 
                    text-muted
                `}
            >
                X
            </button>
            <div className="flex flex-col">
                <div>
                    <p className="font-semibold text-ink">
                        {friendName} challenged you!
                    </p>

                    {!notification.read && (
                        <p className="mt-1 text-sm text-inverse-ink">
                            Choose whether you want to play a match.
                        </p>
                    )}
                </div>

                {error && (
                    <p role="alert" className="text-sm text-red-400">
                        {error}
                    </p>
                )}

                {(!notification.read) && (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => handleInteraction('accept')}
                            disabled={declining}
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
                            Accept
                        </button>

                        <button
                            type="button"
                            onClick={() => handleInteraction('decline')}
                            disabled={declining}
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
                            {declining ? "Declining..." : "Decline"}
                        </button>
                    </div>
                )}
            </div>

            {showDialog && (
                <ChallengeFriendDialog
                    mode="accept"
                    invitationId={notification.requestId}
                    onClose={() => setShowDialog(false)}
                />
            )}
        </div>
    );
}