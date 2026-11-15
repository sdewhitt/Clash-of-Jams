import { useNavigate } from "react-router"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth/useAuth"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
import { NotificationButton } from "@/components/NotificationButton"
import { LiveElo } from "@/components/LiveElo"
import type { Community } from "@/lib/schema/types"
import { getMyCommunities } from "@/lib/communities/communitySearch"
import CommunitySearchResults from "@/components/CommunitySearchResult"
import { CreateCommunityCard } from "@/components/CreateCommunityCard"
import { collectionGroup, getDoc, onSnapshot, query, where,} from "firebase/firestore";
import { db } from "@/lib/firebase";
import CommunityRequestButton from "@/components/CommunityRequestButton";

export function MyCommunities() {
    const { user, profile } = useAuth();
    const navigate = useNavigate();

    const [showCommunityCreation, setShowCommunityCreation] = useState(false);

    const [view, setView] = useState<"communities" | "pending">("communities");

    const [searchTerm, setSearchTerm] = useState("");

    const [communities, setCommunities] = useState<Community[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [pendingCommunities, setPendingCommunities] = useState<Community[]>([]);
    const [pendingLoading, setPendingLoading] = useState(false);
    const [pendingError, setPendingError] = useState<string | null>(null);

    const showingPending = view === "pending";
    
    const activeUid = user?.uid;

    const canLoadPending = showingPending && profile?.isProfilePublic === true;

    const visibleCommunities = showingPending ? pendingCommunities : communities;
    const visibleLoading = showingPending ? pendingLoading : loading;
    const visibleError = showingPending ? pendingError : error;

    const search = searchTerm.trim().toLowerCase();
    const filteredCommunities = visibleCommunities.filter(community =>
        community.name.toLowerCase().includes(search)
    );

    useEffect(() => {
        if (!user || !profile) {
            setCommunities([]);
            return;
        }

        let cancelled = false;

        async function loadCommunities() {
            setLoading(true);
            setError(null);

            try {
                const myCommunities = await getMyCommunities(profile?.communities ?? []);

                if (!cancelled) {
                    setCommunities(myCommunities);
                }
            } catch (err) {
                console.error("Failed to load your communities:", err);

                if (!cancelled) {
                    setError("Unable to load your communities. Please try again.");
                    setCommunities([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadCommunities();

        return () => {
            cancelled = true;
        };
    }, [user?.uid, profile?.communities]);

    useEffect(() => {
        setPendingCommunities([]);
        setPendingError(null);
        setPendingLoading(Boolean(canLoadPending && activeUid));
    
        if (!canLoadPending || !activeUid) return;
    
        let currentLoad = 0;
    
        const pendingQuery = query(
            collectionGroup(db, "requests"),
            where("outsiderUid", "==", activeUid),
            where("requestType", "in", ["community_knock_request", "community_invitation_request"]),
            where("status", "==", "pending"),
        );
    
        const unsubscribe = onSnapshot(
            pendingQuery,
            async snapshot => {
                const load = ++currentLoad;
    
                try {
                    const communities = await Promise.all(
                        snapshot.docs.map(async requestDoc => {
                            const communityRef = requestDoc.ref.parent.parent;
                            if (communityRef?.parent.path !== "communities") {
                                return null;
                            }
    
                            const communityDoc = await getDoc(communityRef);
                            return communityDoc.exists()
                                ? ({
                                    ...communityDoc.data(),
                                    id: communityDoc.id,
                                } as Community)
                                : null;
                        }),
                    );
    
                    if (load !== currentLoad) return;
    
                    setPendingCommunities(
                        communities.filter(
                            (community): community is Community => community !== null,
                        ),
                    );
                    setPendingError(null);
                } catch (err) {
                    if (load !== currentLoad) return;
    
                    console.error("Failed to load pending communities:", err);
                    setPendingError("Unable to load pending requests.");
                } finally {
                    if (load === currentLoad) setPendingLoading(false);
                }
            },
            (err) => {
                ++currentLoad;
                console.error("Pending community requests listener failed:", err);
                setPendingError("Unable to listen for pending requests.");
                setPendingLoading(false);
            },
        );
    
        return () => {
            ++currentLoad;
            unsubscribe();
        };
    }, [activeUid, canLoadPending]);

    if (profile && !profile?.isProfilePublic) {
        return (
            <main className="h-dvh flex flex-col overflow-hidden">
                <header className={`
                    shrink-0
                    flex items-center justify-between 
                    bg-linear-to-r 
                    from-accent-base-start from-10% 
                    via-accent-base-middle via-70% 
                    to-accent-base-end to-90% 
                    border-b-4 
                    border-accent-start 
                    pt-6 pb-5
                `}>
                    <div className="flex ml-12">
                        <BackButton onClick={() => navigate('/home')}></BackButton>
                        <h2 className="ml-4 text-4xl font-bold text-ink">Jamming With Your Community</h2>
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
                <div className="flex h-full flex-col items-center justify-center gap-4">
                    <h2 className="text-center text-4xl font-bold text-ink">
                        Your profile must be public to maintain friendships with other users!
                    </h2>
                    <h2 className="text-center text-4xl text-ink mb-4">
                        Please modify your profile publicity in your user settings!
                    </h2>
                    <button
                        type="button"
                        onClick={() => navigate('/profile/edit_profile')}
                        className={`
                            rounded-lg
                            bg-linear-to-b 
                            from-accent-start
                            via-accent-middle 
                            to-accent-end
                            outline-3
                            outline-accent-middle
                            text-4xl
                            text-ink
                            hover:scale-105
                            hover:brightness-125
                            active:scale-95
                            active:brightness-75
                            px-6 py-4
                        `}
                    >
                        Edit Your Profile
                    </button>
                </div>
            </main>
        );
    }
    
    return (
        <main className="h-screen flex flex-col overflow-hidden">
            <header className="flex items-center justify-between bg-linear-to-r from-accent-base-start from-10% via-accent-base-middle via-70% to-accent-base-end to-90% border-b-4 border-accent-start py-6">
                <div className="flex ml-12">
                    <BackButton onClick={() => navigate('/home')}></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">Jamming With Your Community</h1>
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
            <div className="flex flex-1 min-h-0 flex-col p-6">
                <div className="shrink-0 relative px-6 py-6">
                    <div className={`
                        flex flex-col
                        w-fill
                        rounded-lg
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                        border-4
                        border-accent-start
                    `}>
                        <div className={`
                            flex flex-row
                            justify-between
                            px-6
                            py-4
                        `}>
                            <h1 className="text-2xl font-bold mt-2">Your Communities</h1>
                            <div className={`
                                flex flex-row
                                gap-4
                            `}>
                                <button 
                                    className={`
                                        rounded-lg
                                        bg-linear-to-b 
                                        from-contrast-start
                                        via-contrast-middle 
                                        to-contrast-end
                                        outline-3
                                        outline-contrast-middle
                                        text-ink
                                        hover:brightness-125
                                        active:scale-95 
                                        px-3 
                                        py-3`
                                    } 
                                    onClick={() => setShowCommunityCreation(true)}
                                >
                                    Create a Community
                                </button>
                                <button 
                                    className={`
                                        rounded-lg
                                        bg-linear-to-b 
                                        from-contrast-start
                                        via-contrast-middle 
                                        to-contrast-end
                                        outline-3
                                        outline-contrast-middle
                                        text-ink
                                        hover:brightness-125
                                        active:scale-95 
                                        px-3 
                                        py-3`
                                    } 
                                    onClick={() => navigate("/friends/find_communities")}
                                >
                                    Add a Community
                                </button>
                            </div>
                        </div>
                        <div className="px-8 pt-4">
                            <input
                                id="user-search"
                                type="search"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Search by Username..."
                                autoComplete="off"
                                className={`
                                    mr-6
                                    mb-4
                                    px-2 py-2
                                    w-full
                                    rounded-lg
                                    bg-contrast-middle
                                    text-inverse-ink
                                    outline-2
                                    outline-contrast-start
                                    focus:outline-none
                                    focus:ring-3
                                    focus:ring-accent-end
                                    transition-all
                                `}
                            />
                        </div>
                        <div role="group" aria-label="Friend list view" className="flex flex-row items-center gap-4 mx-6 mb-4">
                            <button
                                type="button"
                                aria-pressed={view === "communities"}
                                onClick={() => setView("communities")}
                                className={`
                                    w-1/2
                                    rounded-lg 
                                    px-4 py-2 
                                    bg-linear-to-b
                                    from-contrast-start
                                    via-contrast-middle
                                    to-contrast-end
                                    border-2 border-contrast-start
                                    brightness-80
                                    aria-pressed:brightness-100
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
                                Communities
                            </button>
                            <button
                                type="button"
                                aria-pressed={view === "pending"}
                                onClick={() => setView("pending")}
                                className={`
                                    w-1/2
                                    rounded-lg
                                    px-4 py-2
                                    bg-linear-to-b
                                    from-contrast-start
                                    via-contrast-middle
                                    to-contrast-end
                                    border-2 border-contrast-start
                                    brightness-80
                                    aria-pressed:brightness-100
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
                                Pending requests
                            </button>
                        </div>
                    </div>
                </div>

                {visibleLoading && (
                    <p className="py-4 text-center">
                        {showingPending ? "Loading pending requests..." : "Loading communities..."}
                    </p>
                )}

                {visibleError && (
                    <p role="alert" className="py-4 text-center">{visibleError}</p>
                )}

                {!visibleLoading && !visibleError && visibleCommunities.length === 0 && (
                    <p className="py-4 text-center">
                        {showingPending ? "You have no pending join requests." : "You don't have any communities yet!"}
                    </p>
                )}

                {!visibleLoading && !visibleError && visibleCommunities.length > 0 && filteredCommunities.length === 0 && (
                    <p className="py-4 text-center">
                        No communities found. Try another name.
                    </p>
                )}

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain mx-12">
                    {!visibleLoading && !visibleError && (
                        <div className="space-y-2 p-4">
                            {filteredCommunities.map(community =>
                                showingPending ? (
                                    activeUid && (
                                        <div
                                            key={community.id}
                                            className={`
                                                flex 
                                                w-full 
                                                items-center 
                                                gap-3 
                                                rounded-xl
                                                bg-linear-to-b
                                                from-accent-start
                                                via-accent-middle
                                                to-accent-end
                                                border-2 border-line
                                                p-3 text-left
                                                transition 
                                                hover:border-accent-soft
                                                hover:bg-surface/80
                                                focus-visible:outline-none
                                                focus-visible:ring-2 focus-visible:ring-accent-soft
                                            `}
                                        >
                                            <div className="w-full flex flex-col gap-4">
                                                <div className="w-full flex flex-row justify-between">
                                                    <div className="flex flex-row gap-4">
                                                        {community.communityIcon ? (
                                                            <img
                                                            src={community.communityIcon}
                                                            alt=""
                                                            className="h-16 w-16 rounded-full object-cover"
                                                            />
                                                        ) : (
                                                            <div
                                                            className="
                                                                flex h-12 w-12 shrink-0 items-center
                                                                justify-center rounded-full bg-accent-base-start
                                                                text-lg font-semibold text-ink
                                                            "
                                                            >
                                                            {community.name?.charAt(0).toUpperCase() || "?"}
                                                            </div>
                                                        )}

                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate font-xl font-bold">
                                                                {community.name}
                                                            </p>
                                                            <p className="mt-1 text-xs text-inverse-ink">
                                                                Members: {community.memberCount}
                                                            </p>
                                                            <p className="mt-1 text-xs text-inverse-ink">
                                                                {community.description}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <CommunityRequestButton
                                                        community={community}
                                                        activeUid={activeUid}
                                                        outsiderUid={activeUid}
                                                    />
                                                </div>
                                                {error && (
                                                    <div className={`
                                                        w-full
                                                        rounded-lg
                                                        text-center text-md text-ink
                                                        bg-linear-to-b
                                                        from-contrast-start
                                                        via-contrast-middle
                                                        to-contrast-end
                                                        py-2 px-4
                                                    `}>
                                                        {error}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                ) : (
                                    <CommunitySearchResults
                                        key={community.id}
                                        community={community}
                                        activeUid={profile?.uid ?? ""}
                                        activeDisplayName={profile?.displayName ?? profile?.username ?? "..."}
                                        member={true}
                                    />
                                ),
                            )}
                        </div>
                    )}
                </div>
            </div>
            {showCommunityCreation && profile?.uid && (
                <CreateCommunityCard
                    ownerUid={profile?.uid}
                    ownerDisplayName={profile?.displayName ?? profile?.username ?? "..."}
                    onClose={() => setShowCommunityCreation(false)}
                />
            )}
        </main>
    )
}