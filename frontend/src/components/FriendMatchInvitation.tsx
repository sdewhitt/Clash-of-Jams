import { useEffect, useState } from "react";
import type { AppNotification } from "@/lib/schema/types";
import { declineFriendMatchInvitation } from "@/lib/matchmaking/gameInvitation";
import { ChallengeFriendDialog } from "./ChallengeFriendDialog";
import { getFriendName } from "@/lib/friendship/friendRequests";

interface FriendMatchInvitationProps {
    notification: AppNotification;
}

export function FriendMatchInvitation({ notification, }: FriendMatchInvitationProps) {
    const [showOptions, setShowOptions] = useState(true);

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

    async function handleInteraction(mode: string) {
        if (mode === 'accept') {
            setShowDialog(true);
            setShowOptions(false);
        }
        else {
            void handleDecline();
            setShowOptions(false);
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
        return <p className="p-4 text-sm text-muted">Loading...</p>;
    }

    if (error) {
        return <p className="p-4 text-sm text-red-400">{error}</p>;
    }

    return (
        <div>
            <div className={`
                flex flex-col 
                gap-3
                bg-linear-to-b
                from-contrast-start from-50
                via-contrast-middle
                to-contrast-end to-70
                brightness-80
                border-b border-line 
                p-4
            `}>
                <div>
                    <p className="font-semibold text-ink">
                        {friendName} challenged you!
                    </p>

                    {!notification.read && (
                        <p className="mt-1 text-sm text-muted">
                            Choose whether you want to play a match.
                        </p>
                    )}
                </div>

                {error && (
                    <p role="alert" className="text-sm text-red-400">
                        {error}
                    </p>
                )}

                {(!notification.read && showOptions) && (
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