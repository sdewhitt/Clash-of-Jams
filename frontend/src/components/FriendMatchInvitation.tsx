import { useState } from "react";
import type { AppNotification } from "@/lib/schema/types";
import { declineFriendMatchInvitation } from "@/lib/matchmaking/gameInvitation";
import { ChallengeFriendDialog } from "./ChallengeFriendDialog";

interface FriendMatchInvitationProps {
    notification: AppNotification;
    senderName: string;
}

export function FriendMatchInvitation({
    notification,
    senderName,
}: FriendMatchInvitationProps) {
    const [showDialog, setShowDialog] = useState(false);
    const [declining, setDeclining] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleDecline() {
        if (declining) return;

        try {
            setDeclining(true);
            setError(null);

            await declineFriendMatchInvitation({
                invitationId: notification.requestId,
            });
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

    return (
        <div>
            <div className="flex flex-col gap-3 border-b border-line p-4">
                <div>
                    <p className="font-semibold text-ink">
                        {senderName} challenged you!
                    </p>

                    <p className="mt-1 text-sm text-muted">
                        Choose whether you want to play a match.
                    </p>
                </div>

                {error && (
                    <p role="alert" className="text-sm text-red-400">
                        {error}
                    </p>
                )}

                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setShowDialog(true)}
                        disabled={declining}
                        className="
                            flex-1 rounded-lg
                            bg-accent-start px-3 py-2
                            font-semibold text-white
                            hover:brightness-110
                            disabled:opacity-50
                        "
                    >
                        Accept
                    </button>

                    <button
                        type="button"
                        onClick={() => void handleDecline()}
                        disabled={declining}
                        className="
                            flex-1 rounded-lg
                            border border-line px-3 py-2
                            font-semibold text-ink
                            hover:bg-base
                            disabled:opacity-50
                        "
                    >
                        {declining ? "Declining..." : "Decline"}
                    </button>
                </div>
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