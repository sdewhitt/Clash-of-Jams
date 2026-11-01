import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { BackButton } from "@/components/BackButton";
import { NotificationButton } from "@/components/NotificationButton";
import { LiveElo } from "@/components/LiveElo";
import { ProfileButton } from "@/components/ProfileButton";
import { useAuth } from "@/lib/auth/useAuth";

type InvitationState = "pending" | "accepted" | "declined" | "expired";

interface FriendInvitation {
    state: InvitationState;
    matchId: string | null;
    fromUid: string;
    toUid: string;
}

export function FriendMatchWaiting() {
    const { user, profile } = useAuth();
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
            <div className="flex flex-col gap-8">
                <header className={`
                    sticky
                    top-0
                    z-50
                    flex
                    items-center
                    justify-between
                    bg-linear-to-r
                    from-accent-base-start
                    via-accent-base-middle
                    to-accent-base-end
                    border-b-4
                    border-accent-start
                    py-6`
                }>
                    <div className="flex ml-12">
                        <BackButton onClick={() => navigate(-1)}/>
                        <h1 className="ml-4 text-4xl font-bold text-ink">Friendly Competition</h1>
                    </div>
    
                    <div className="ml-auto flex items-center gap-3 sm:gap-4 mr-12">
                        <NotificationButton uid={profile?.uid ?? ""}/>
                        <LiveElo />
                        <ProfileButton
                            className="w-36 shrink-0 sm:w-50"
                            username={profile?.displayName ?? user?.email ?? '…'}
                            userAvatar={profile?.avatarUrl ?? '../../favicon.svg'}
                        />
                    </div>
                </header>
                <div
                    className={`
                        flex flex-col
                        items-centers
                        w-full
                    `}
                >
                    <h1 className={`
                        bg-linear-to-b
                        from-accent-base-start
                        via-accent-base-middle
                        to-accent-base-end
                        text-5xl text-center
                        border-4
                        border-accent-start
                        rounded-2xl
                        m-24
                        p-12
                    `}>
                        Your challenge was declined.
                    </h1>
                </div>
            </div>
        );
    }

    if (state === "expired") {
        return (
            <div className="flex flex-col gap-8">
                <header className={`
                    sticky
                    top-0
                    z-50
                    flex
                    items-center
                    justify-between
                    bg-linear-to-r
                    from-accent-base-start
                    via-accent-base-middle
                    to-accent-base-end
                    border-b-4
                    border-accent-start
                    py-6`
                }>
                    <div className="flex ml-12">
                        <BackButton onClick={() => navigate(-1)}/>
                        <h1 className="ml-4 text-4xl font-bold text-ink">Friendly Competition</h1>
                    </div>
    
                    <div className="ml-auto flex items-center gap-3 sm:gap-4 mr-12">
                        <NotificationButton uid={profile?.uid ?? ""}/>
                        <LiveElo />
                        <ProfileButton
                            className="w-36 shrink-0 sm:w-50"
                            username={profile?.displayName ?? user?.email ?? '…'}
                            userAvatar={profile?.avatarUrl ?? '../../favicon.svg'}
                        />
                    </div>
                </header>
                <div
                    className={`
                        flex flex-col
                        items-centers
                        w-full
                    `}
                >
                    <h1 className={`
                        bg-linear-to-b
                        from-accent-base-start
                        via-accent-base-middle
                        to-accent-base-end
                        text-5xl text-center
                        border-4
                        border-accent-start
                        rounded-2xl
                        m-24
                        p-12
                    `}>
                        Your challenge was declined.
                    </h1>
                </div>
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