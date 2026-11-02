import { useNavigate } from "react-router"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth/useAuth"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
import { getFriendProfiles } from "@/lib/profile/userProfileSearch"
import type { SearchProfile } from "@/lib/schema/types"
import UserSearchResult from "@/components/UserSearchResult"
import { NotificationButton } from "@/components/NotificationButton"
import { LiveElo } from "@/components/LiveElo"

export function MyFriends() {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    
    const [searchTerm, setSearchTerm] = useState("");
    const [friends, setFriends] = useState<SearchProfile[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [instrumentFilter, setInstrumentFilter] = useState("all");

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

    const filteredFriends = friends.filter(friend => {
        const matchesUsername = friend.usernameLower?.includes(
            searchTerm.trim().toLowerCase()
        ) ?? false;
    
        const matchesInstrument =
            instrumentFilter === "all" ||
            friend.preferredInstrument?.includes(instrumentFilter);
    
        return matchesUsername && matchesInstrument;
    });

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
                    <h1 className="ml-4 text-4xl font-bold text-ink">My Friends</h1>
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
                            py-4`
                        }>
                            <h1 className="text-2xl font-bold mt-2">Your Friends</h1>
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
                                onClick={() => navigate("/friends/find_friends")}
                            >
                                Add a Friend
                            </button>
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
                        </div>
                    </div>
                </div>

                {loading && (
                    <p className="text-center py-4">
                        Loading friends...
                    </p>
                )}

                {error && (
                    <p className="text-center py-4">
                        {error}
                    </p>
                )}

                {!loading && !error && friends.length === 0 && (
                    <p className="text-center py-4">
                        You don't have any friends yet!
                    </p>
                )}

                {!loading && !error &&
                    friends.length > 0 &&
                    filteredFriends.length === 0 && (
                        <p className="text-center py-4">
                            No friends found. Try another username.
                        </p>
                    )
                }

                <div className="
                    flex-1
                    min-h-0
                    overflow-y-auto
                    overscroll-contain
                    mx-12
                ">
                    {!loading && !error && filteredFriends.length > 0 && (
                        <div className="space-y-2 p-4">
                            {filteredFriends.map(friend => (
                                <UserSearchResult
                                    key={friend.uid}
                                    profile={friend}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}