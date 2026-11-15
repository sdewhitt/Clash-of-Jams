import { useNavigate } from "react-router"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth/useAuth"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
import { getFriendProfiles, getPendingFriendRequests, pendingFriendRequestsQuery } from "@/lib/profile/userProfileSearch"
import type { FriendRequest, PendingFriendRow, SearchProfile } from "@/lib/schema/types"
import UserSearchResult from "@/components/UserSearchResult"
import { NotificationButton } from "@/components/NotificationButton"
import { LiveElo } from "@/components/LiveElo"
import { onSnapshot } from "firebase/firestore"

type FriendListRow = {
    profile: SearchProfile;
    request?: Pick<PendingFriendRow, "initiatorUid" | "createdAt">;
};

export function MyFriends() {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    
    const [view, setView] = useState<"friends" | "pending">("friends");

    const [searchTerm, setSearchTerm] = useState("");
    const [instrumentFilter, setInstrumentFilter] = useState("all");
    const [requestFilter, setRequestFilter] = useState("all");

    const [friends, setFriends] = useState<SearchProfile[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [pendingProfiles, setPendingProfiles] = useState<PendingFriendRow[]>([]);
    const [pendingLoading, setPendingLoading] = useState(false);
    const [pendingError, setPendingError] = useState<string | null>(null);

    const showingPending = view === "pending";
    const visibleProfiles = showingPending ? pendingProfiles : friends;
    const visibleLoading = showingPending ? pendingLoading : loading;
    const visibleError = showingPending ? pendingError : error;

    useEffect(() => {
        if (!user || !profile) {
            setFriends([]);
            return;
        }

        let cancelled = false;

        async function loadFriends() {
            setLoading(true);
            setError(null);

            try {
                const friendProfiles = await getFriendProfiles(
                    user!.uid,
                    profile!.friends ?? []
                );

                if (!cancelled) {
                    setFriends(friendProfiles);
                }
            } catch (err) {
                console.error("Failed to load friends:", err);

                if (!cancelled) {
                    setError("Unable to load friends. Please try again.");
                    setFriends([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        loadFriends();

        return () => {
            cancelled = true;
        };
    }, [user?.uid, profile?.friends]);

    useEffect(() => {
        if (!user) {
            setPendingProfiles([]);
            setPendingLoading(false);
            setPendingError(null);
            return;
        }

        let currentLoad = 0;
        setPendingProfiles([]);
        setPendingLoading(true);
        setPendingError(null);

        const unsubscribe = onSnapshot(
            pendingFriendRequestsQuery(user?.uid),
            async snapshot => {
                const load = ++currentLoad;

                try {
                    const requests = snapshot.docs.map(requestDoc => requestDoc.data() as FriendRequest);
                    const profiles = await getPendingFriendRequests(user?.uid, requests);

                    if (load === currentLoad) {
                        setPendingProfiles(profiles);
                        setPendingError(null);
                    }
                } catch {
                    if (load === currentLoad) {
                        setPendingError("Unable to load pending requests.");
                    }
                } finally {
                    if (load === currentLoad) {
                        setPendingLoading(false);
                    }
                }
            },
            (err) => {
                ++currentLoad;
                console.error("Pending friend requests listener failed", err.code, err.message);
                setPendingError("Unable to listen for pending requests.");
                setPendingLoading(false);
            }
        );

        return () => {
            ++currentLoad;
            unsubscribe();
        };
    }, [user?.uid]);

    const visibleRows: FriendListRow[] = showingPending
        ? pendingProfiles.map(({ profile, initiatorUid, createdAt }) => ({
            profile,
            request: { initiatorUid, createdAt },
        }))
        : friends.map(profile => ({ profile }));

    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filteredProfiles = visibleRows.filter(({ profile, request }) => {
        const matchesUsername = profile.usernameLower?.includes(normalizedSearch) ?? false;
    
        const matchesInstrument = instrumentFilter === "all" || profile.preferredInstrument?.includes(instrumentFilter);
    
        if (!matchesUsername || !matchesInstrument) {
            return false;
        }
    
        if (!showingPending || requestFilter === "all") {
            return true;
        }
    
        if (!user || !request) {
            return false;
        }
    
        const requestDirection = request.initiatorUid === user.uid ? "sent" : "received";
    
        return requestFilter === requestDirection;
    });

    async function handleClear() {
        if (showingPending) {
            setRequestFilter("all")
        }
        setSearchTerm("")
        setInstrumentFilter("all")
    }

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
                        <h2 className="ml-4 text-4xl font-bold text-ink">Jamming With Your Friends</h2>
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
                    <h2 className="ml-4 text-4xl font-bold text-ink">Jamming With Your Friends</h2>
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
                            bg-linear-to-b 
                            from-contrast-start
                            via-contrast-middle 
                            to-contrast-end
                            border-b-4 border-accent-start
                            px-6
                            py-4
                        `}>
                            <h1 className="text-4xl font-bold mt-2">
                                {view === "friends" ? "Your Friends" : "Pending Requests"}
                            </h1>
                            <div className="flex flex-row gap-4">
                                <button 
                                    className={`
                                        rounded-lg
                                        bg-linear-to-b 
                                        from-accent-start
                                        via-accent-middle 
                                        to-accent-end
                                        outline-3
                                        outline-accent-middle
                                        text-ink
                                        hover:brightness-125
                                        active:scale-95 
                                        px-3 
                                        py-3`
                                    } 
                                    onClick={() => navigate("/friends/find_friends")}
                                >
                                    Add a Friend
                                </button>
                                <button
                                    className={`
                                        rounded-lg
                                        bg-linear-to-b
                                        from-accent-start
                                        via-accent-middle
                                        to-accent-end
                                        outline-3
                                        outline-accent-middle
                                        text-ink
                                        hover:brightness-125
                                        active:scale-95
                                        px-3
                                        py-3`
                                    }
                                    onClick={() => navigate("/friends/shared_scores")}
                                >
                                    Shared With You
                                </button>
                            </div>
                        </div>
                        <div
                            className={`
                                flex flex-row
                            `}
                        >
                            <input
                                id="user-search"
                                type="search"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Search by Username..."
                                autoComplete="off"
                                className={`
                                    m-4
                                    px-2 py-2
                                    w-5/6
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
                            <select
                                id="preferredInstrument"
                                name="instrument"
                                value={instrumentFilter}
                                onChange={(e) => setInstrumentFilter(e.target.value)}
                                required
                                className={`
                                    m-4
                                    px-2 py-2
                                    w-1/6
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
                            >
                                <option className="text-md text-black" value="all">All Instruments</option>
                                <option className="text-md text-black" value="piano">Piano</option>
                                <option className="text-md text-black" value="guitar">Guitar</option>
                                <option className="text-md text-black" value="woodwind">Woodwind</option>
                                <option className="text-md text-black" value="vocals">Vocals</option>
                                <option className="text-md text-black" value="midi">Midi</option>
                            </select>
                            {view === "pending" && (
                                <select
                                    id="requestTypeFilter"
                                    name="requestType"
                                    value={requestFilter}
                                    onChange={(e) => setRequestFilter(e.target.value)}
                                    required
                                    className={`
                                        m-4
                                        px-2 py-2
                                        w-1/6
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
                                >
                                    <option className="text-md text-black" value="all">All Requests</option>
                                    <option className="text-md text-black" value="sent">Sent</option>
                                    <option className="text-md text-black" value="recieved">Recieved</option>
                                </select>
                            )}
                        </div>
                        <div role="group" aria-label="Friend list view" className="flex flex-row items-center gap-4 mx-6 mb-4">
                            <button
                                type="button"
                                aria-pressed={view === "friends"}
                                onClick={() => setView("friends")}
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
                                Friends
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
                    <div className="flex h-full flex-col items-center justify-center gap-4">
                        <div className="h-32 w-32 animate-spin rounded-full border-10 border-accent-start border-t-transparent"></div>
                        <p className="text-center text-4xl py-4">
                            Loading users...
                        </p>
                    </div>
                )}

                {visibleError && (
                    <p className="text-center text-2xl py-4">
                        {visibleError}
                    </p>
                )}

                {!visibleLoading && !visibleError && visibleProfiles.length === 0 && (
                    <div className="flex flex-col items-center gap-2">
                        <p className="text-center text-2xl py-4">
                            {showingPending ? "No pending friend requests currently active!" : "No friends found to be associated with your account! "}
                        </p>
                        <button 
                            className={`
                                rounded-lg
                                bg-linear-to-b 
                                from-accent-start
                                via-accent-middle 
                                to-accent-end
                                outline-3
                                outline-accent-middle
                                text-ink
                                hover:brightness-125
                                active:scale-95 
                                px-6 
                                py-4
                            `} 
                            onClick={() => navigate("/friends/find_friends")}
                        >
                            Add a Friend
                        </button>
                    </div>
                )}

                {!visibleLoading && !visibleError && visibleProfiles.length > 0 && filteredProfiles.length === 0 && (
                    <div className="flex flex-col items-center gap-2">
                        <p className="text-center text-2xl py-4">
                            No users found. Try different search criteria.
                        </p>
                        <button
                            type="button"
                            onClick={() => handleClear()}
                            className={`
                                rounded-lg
                                px-6 py-4
                                bg-linear-to-b
                                from-accent-start
                                via-accent-middle
                                to-accent-end
                                border-2 border-accent-start
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

                <div className="
                    flex-1
                    min-h-0
                    overflow-y-auto
                    overscroll-contain
                    mx-12
                ">
                    {!loading && !error && filteredProfiles.length > 0 && (
                        <div className="space-y-2 p-4">
                            {filteredProfiles.map(profile => (
                                <UserSearchResult
                                    key={profile.profile.uid}
                                    profile={profile.profile}
                                    invertColor={false}
                                    request={profile.request}
                                    communitySearch={false}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}