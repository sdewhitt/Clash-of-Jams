import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

type InvitationState = "pending" | "accepted" | "declined" | "expired";

interface FriendInvitation {
    state: InvitationState;
    matchId: string | null;
    fromUid: string;
    toUid: string;
}

export function FriendMatchWaiting() {
    const { invitationId } = useParams<{ invitationId: string }>();
    const navigate = useNavigate();

    const [state, setState] = useState<InvitationState>("pending");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!invitationId) {
            setError("Missing invitation ID.");
            setLoading(false);
            return;
        }

        const invitationRef = doc(
            db,
            "matchInvitations",
            invitationId
        );

        const unsubscribe = onSnapshot(
            invitationRef,
            (snapshot) => {
                if (!snapshot.exists()) {
                    setError("This invitation could not be found.");
                    setLoading(false);
                    return;
                }

                const invitation =
                    snapshot.data() as FriendInvitation;

                setState(invitation.state);
                setLoading(false);

                if (
                    invitation.state === "accepted" &&
                    invitation.matchId
                ) {
                    navigate(
                        `/multiplayer/${encodeURIComponent(invitation.matchId)}`,
                        { replace: true }
                    );
                }
            },
            (err) => {
                console.error("Invitation listener failed:", err);
                setError("Unable to monitor your invitation.");
                setLoading(false);
            }
        );

        return unsubscribe;
    }, [invitationId, navigate]);

    if (loading) {
        return <p>Connecting to invitation...</p>;
    }

    if (error) {
        return <p role="alert">{error}</p>;
    }

    if (state === "declined") {
        return (
            <div>
                <h1>Your challenge was declined.</h1>
                <button onClick={() => navigate(-1)}>
                    Return to Profile
                </button>
            </div>
        );
    }

    if (state === "expired") {
        return (
            <div>
                <h1>Your challenge expired.</h1>
                <button onClick={() => navigate(-1)}>
                    Return to Profile
                </button>
            </div>
        );
    }

    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-accent-start border-t-transparent" />

            <h1 className="text-3xl font-bold text-ink">
                Waiting for your friend...
            </h1>

            <p className="text-muted">
                Your challenge has been sent. You'll automatically enter
                the lobby when your friend accepts.
            </p>
        </main>
    );
}