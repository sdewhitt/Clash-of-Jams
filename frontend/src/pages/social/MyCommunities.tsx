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

export function MyCommunities() {
    const { user, profile } = useAuth();
    const navigate = useNavigate();

    const [showCommunityCreation, setShowCommunityCreation] = useState(false);

    const [searchTerm, setSearchTerm] = useState("");
    const [communities, setCommunities] = useState<Community[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

    const filteredCommunities = communities.filter(community => {
        const matchesCommunity = community.name.includes(
            searchTerm.trim().toLowerCase()
        ) ?? false;

        return matchesCommunity;
    });
    
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
                    </div>
                </div>

                {loading && (
                    <p className="text-center py-4">
                        Loading communities...
                    </p>
                )}

                {error && (
                    <p className="text-center py-4">
                        {error}
                    </p>
                )}

                {!loading && !error && communities.length === 0 && (
                    <p className="text-center py-4">
                        You don't have any communities yet!
                    </p>
                )}

                {!loading && !error &&
                    communities.length > 0 &&
                    filteredCommunities.length === 0 && (
                        <p className="text-center py-4">
                            No communities found. Try another name.
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
                    {!loading && !error && filteredCommunities.length > 0 && (
                        <div className="space-y-2 p-4">
                            {filteredCommunities.map(community => (
                                <CommunitySearchResults
                                    key={community.id}
                                    community={community}
                                    activeUid={profile?.uid ?? ""}
                                    activeDisplayName={profile?.displayName ?? profile?.username ?? "..."}
                                    member={true}
                                />
                            ))}
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