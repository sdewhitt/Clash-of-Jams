import { useNavigate } from "react-router"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth/useAuth"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
import { searchPublicUsers } from "@/lib/profile/userProfileSearch"
import type { SearchProfile } from "@/lib/schema/types"
import UserSearchResult from "@/components/UserSearchResult"
import { NotificationButton } from "@/components/NotificationButton"
import { LiveElo } from "@/components/LiveElo"

export function MyFriends() {
    const { user, profile } = useAuth();
    const navigate = useNavigate();

    const [ searchTerm, setSearchTerm ] = useState("");
    const [ results, setResults ] = useState<SearchProfile[]>([]);
    const [ loading, setLoading ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);

    useEffect(() => {
        if (!user) {
            return;
        }

        const term = searchTerm.trim();

        let override = false;
        if (term.length == 0) {
            override = true;
        }
        else if (term.length < 3) {
            setResults([]);
            setLoading(false);
            setError(null);
            return;
        }

        let cancelled = false;

        const timer = window.setTimeout(async () => {
            setLoading(true);
            setError(null);

            try {
                const users = await searchPublicUsers(user?.uid, term, true, override);

                if (!cancelled) {
                    setResults( users );
                }
            } catch (err) {
                console.error("Failed to search friends:", err);

                if (!cancelled) {
                    setError("Unable to search friends. Please try again.");
                    setResults([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }, 300);

        return () => {
        cancelled = true;
        override = false;
        window.clearTimeout(timer);
        };
    }, [searchTerm, user?.uid]);

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
                                rounded-lg 
                                bg-contrast-middle 
                                text-inverse-ink
                                outline-2 
                                outline-contrast-start 
                                focus:outline-none 
                                focus:ring-3 
                                focus:ring-accent-end 
                                transition-all`
                            }
                        />
                    </div>
                </div>

                {searchTerm.trim().length != 0 && searchTerm.trim().length < 3 && (
                    <div className={`
                        flex items-center justify-center
                        rounded-lg
                        py-4
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                        
                        mx-12
                    `}>
                        <p className="text-center text-md text-muted">
                            Type at least 3 characters to search.
                        </p>
                    </div>
                )}

                {loading && (
                    <div className={`
                        flex items-center justify-center
                        rounded-lg
                        py-4
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                        mx-12
                    `}>
                        <p className="text-center text-md text-muted">
                            Searching friends...
                        </p>
                    </div>
                )}

                {error && (
                    <div className={`
                        flex items-center justify-center
                        rounded-lg
                        py-4
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                        mx-12
                    `}>
                        <p className="text-center text-md text-muted">
                            {error}
                        </p>
                    </div>
                )}

                {!loading && !error && searchTerm.trim().length >= 3 && results.length === 0 && (
                    <div className={`
                        flex items-center justify-center
                        rounded-lg
                        py-4
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                        mx-12
                    `}>
                        <p className="text-center text-md text-muted">
                            No friends found. Try another username.
                        </p>
                    </div>
                )}

                <div className={`
                    flex-1 
                    min-h-0
                    overflow-y-auto
                    overscroll-contain
                    mx-12
                `}>
                    {!loading && (
                        <div>
                            {results.length > 0 && (
                                <div className="space-y-2 p-4">
                                    {results.map((profile) => (
                                        <UserSearchResult
                                            key={profile.uid}
                                            profile={profile}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}