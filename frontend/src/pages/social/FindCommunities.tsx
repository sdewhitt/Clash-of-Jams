import { useNavigate } from "react-router"
import { useAuth } from "@/lib/auth/useAuth"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
import { NotificationButton } from "@/components/NotificationButton"
import { LiveElo } from "@/components/LiveElo"
import { searchCommunities } from "@/lib/communities/communitySearch"
import { useEffect, useState } from "react"
import type { Community } from "@/lib/schema/types"
import CommunitySearchResult from "@/components/CommunitySearchResult"

export function FindCommunities() {  
    const { user, profile } = useAuth()
    const navigate = useNavigate();

    const [ searchTerm, setSearchTerm ] = useState("");
    const [ results, setResults ] = useState<Community[]>([]);
    const [ loading, setLoading ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);
    const [ onlyPublic, setOnlyPublic ] = useState(false);

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
            setLoading(false);
            setError(null);
            return;
        }

        let cancelled = false;

        const timer = window.setTimeout(async () => {
            setLoading(true);
            setError(null);

            try {
                const communities = await searchCommunities(user?.uid, term, override);

                if (!cancelled) {
                    setResults( communities );
                }
            } catch (err) {
                console.error("Failed to search communities:", err);

                if (!cancelled) {
                    setError("Unable to search communities. Please try again.");
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

    const publicCommunities = [...results]
        .filter((community) => community.isPublic )

    return (
        <main className="h-screen flex flex-col overflow-hidden">
            <header className="flex items-center justify-between bg-linear-to-r from-accent-base-start from-10% via-accent-base-middle via-70% to-accent-base-end to-90% border-b-4 border-accent-start pt-6 pb-5">
                <div className="flex ml-12">
                    <BackButton onClick={() => navigate('/friends/my_communities')}></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">Find Communities</h1>
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
                <div className={`
                    shrink-0
                    relative
                    rounded-lg
                    bg-linear-to-b
                    from-accent-start
                    via-accent-middle
                    to-accent-end
                    border-4
                    border-accent-start
                    p-4
                `}>
                    <label
                        htmlFor="community-search"
                        className="mb-2 block text-lg font-medium text-ink"
                    >
                        Search For Communities:
                    </label>
                    <input
                        id="community-search"
                        type="search"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Enter at least 3 characters..."
                        autoComplete="off"
                        className={`
                            w-full 
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
                <button
                    type="button"
                    onClick={() => setOnlyPublic(!onlyPublic)}
                    aria-pressed={onlyPublic}
                    className={`
                        w-full
                        rounded-lg
                        px-4 py-2
                        my-4
                        select-none
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                        text-ink
                        transition
                        duration-200
                        border-2
                        hover:scale-101
                        active:scale-99
                        active:opacity-30%
                        active:brightness-60
                    `}
                >
                    {onlyPublic ? "Public Communities" : "All Communities"}
                </button>

                {searchTerm.trim().length != 0 && searchTerm.trim().length < 3 && (
                    <div className={`
                        flex items-center justify-center
                        rounded-lg
                        py-4
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                    `}>
                        <p className="text-center text-md text-inverse-ink">
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
                    `}>
                        <p className="text-center text-md text-inverse-ink">
                            Searching communities...
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
                    `}>
                        <p className="text-center text-md text-inverse-ink">
                            {error}
                        </p>
                    </div>
                )}

                {!loading && !error && (searchTerm.trim().length >= 3 || searchTerm.trim().length == 0) && results.length === 0 && (
                    <div className={`
                        flex items-center justify-center
                        rounded-lg
                        py-4
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                    `}>
                        <p className="text-center text-md text-inverse-ink">
                            No communities found. Try another name.
                        </p>
                    </div>
                )}

                <div className={`
                    flex-1 
                    min-h-0
                    overflow-y-auto
                    overscroll-contain
                `}>
                    {!loading && !onlyPublic && (
                        <div className="py-4">
                            {results.length > 0 && (
                                <div className="space-y-2 p-4">
                                    {results.map((community) => (
                                        <CommunitySearchResult
                                            key={community.id}
                                            community={community}
                                            activeUid={profile?.uid ?? ""}
                                            activeDisplayName={profile?.displayName ?? profile?.username ?? "..."}
                                            member={false}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {!loading && onlyPublic && (
                        <div className="py-4">
                            {publicCommunities.length > 0 && (
                                <section className="space-y-3 p-4">
                                    <div className="space-y-2">
                                        {publicCommunities.map((community) => (
                                            <CommunitySearchResult
                                                key={community.id}
                                                community={community}
                                                activeUid={profile?.uid ?? ""}
                                                activeDisplayName={profile?.displayName ?? profile?.username ?? "..."}
                                                member={false}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}
                            {publicCommunities.length == 0 && (
                                <div className={`
                                    flex items-center justify-center
                                    rounded-lg
                                    py-4
                                    bg-linear-to-b
                                    from-accent-start
                                    via-accent-middle
                                    to-accent-end
                                `}>
                                    <p className="text-center text-md text-inverse-ink">
                                        No public communities found matching your query. Please search a different name or look at all results.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}