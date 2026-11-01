import { useEffect, useState } from "react"
import { useNavigate } from "react-router"
import { useAuth } from "@/lib/auth/useAuth"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
import type { SearchProfile } from "@/lib/schema/types"
import { searchPublicUsers } from "@/lib/profile/userProfileSearch"
import UserSearchResult from "@/components/UserSearchResult"

export function FindFriends() {  
    const { user, profile } = useAuth();
    const navigate = useNavigate();

    function navPortal(location: string) {
        navigate(location)
    }

    const [ searchTerm, setSearchTerm ] = useState("");
    const [ results, setResults ] = useState<SearchProfile[]>([]);
    const [ loading, setLoading ] = useState(false);
    const [ error, setError ] = useState<string | null>(null);
    const [ onlyRecommended, setOnlyRecommended ] = useState(false)

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
                const users = await searchPublicUsers(user?.uid, term, false, override);

                if (!cancelled) {
                    setResults( users );
                }
            } catch (err) {
                console.error("Failed to search users:", err);

                if (!cancelled) {
                setError("Unable to search users. Please try again.");
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

    const potentialFriends = [...results]
        .filter((profile) => profile.relationship !== "friend" )
        .sort((a, b) => b.mutualFriendCount - a.mutualFriendCount);
    
    const recommendedFriends = [...results]
        .filter((profile) => profile.relationship === "friendOfFriend")
        .sort((a, b) => b.mutualFriendCount - a.mutualFriendCount);

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
                    <BackButton onClick={() => navPortal('/friends/my_friends')}></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">Find Friends</h1>
                </div>
                <div className="mr-6">
                    <ProfileButton
                        username={profile?.displayName ?? user?.email ?? "…"}
                        userAvatar={profile?.avatarUrl ?? "../../favicon.svg"}
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
                        htmlFor="user-search"
                        className="mb-2 block text-lg font-medium text-ink"
                    >
                        Search For Users:
                    </label>

                    <input
                        id="user-search"
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
                    onClick={() => setOnlyRecommended(!onlyRecommended)}
                    aria-pressed={onlyRecommended}
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
                    {onlyRecommended ? "Friends of Your Friends" : "All Users"}
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
                            Searching players...
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
                            No users found. Try another username.
                        </p>
                    </div>
                )}

                <div className={`
                    flex-1 
                    min-h-0
                    overflow-y-auto
                    overscroll-contain
                `}>
                    {!loading && !onlyRecommended && (
                        <div className="py-4">
                            {potentialFriends.length > 0 && (
                                <div className="space-y-2 p-4">
                                    {potentialFriends.map((profile) => (
                                        <UserSearchResult
                                            key={profile.uid}
                                            profile={profile}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {!loading && onlyRecommended && (
                        <div className="py-4">
                            {recommendedFriends.length > 0 && (
                                <section className="space-y-3 p-4">
                                    <div className="space-y-2">
                                        {recommendedFriends.map((profile) => (
                                            <UserSearchResult
                                                key={profile.uid}
                                                profile={profile}
                                            />
                                        ))}
                                    </div>
                                </section>
                            )}
                            {recommendedFriends.length == 0 && (
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
                                        No users found that share mutual friends. Please search a different username or look at all results.
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