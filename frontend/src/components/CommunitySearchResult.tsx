import { joinCommunity, leaveCommunity } from "@/lib/communities/communityManagement";
import type { Community } from "@/lib/schema/types";
import { useState } from "react";
import { useNavigate } from "react-router"

interface CommunitySearchResultProps {
    community: Community;
    activeUid: string,
    activeDisplayName: string,
    member: boolean
}
  
export default function CommunitySearchResult({ community, activeUid, activeDisplayName, member, }: CommunitySearchResultProps) {
    const navigate = useNavigate();
    const initials = community.name?.charAt(0) || "?";
    const [joining, setJoining] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleJoining() {
        if (joining) return;

        try {
            setJoining(true);
            setError(null);

            await joinCommunity(community.id, activeUid, activeDisplayName);

            navigate(`/community/${encodeURIComponent(community.id)}`, { replace: true });
        } catch (err) {
            console.error("Failed to join community:",  err );

            setError(err instanceof Error ? err.message : "Unable to join community.");
        } finally {
            setJoining(false);
        }
    }

    async function handleLeaving() {
        if (joining) return;

        try {
            setLeaving(true);
            setError(null);

            await leaveCommunity(community.id, activeUid);

            navigate(`/friends/my_communities`);
        } catch (err) {
            console.error("Failed to leave community:",  err );

            setError(err instanceof Error ? err.message : "Unable to leave community.");
        } finally {
            setLeaving(false);
        }
    }

    if (member) {
        return (
            <div
                onClick={() => navigate(`/community/${community.id}`)}
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
                                {initials.toUpperCase()}
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

                        <button 
                            type="button"
                            onClick={(event) => {
                                event.stopPropagation();
                                handleLeaving()
                            }}
                            className={`
                                rounded-lg
                                text-inverse-ink
                                bg-linear-to-b
                                from-contrast-start
                                via-contrast-middle
                                to-contrast-end
                                border-2 border-line border-ink
                                hover:scale-105
                                hover:brightness-110
                                active:scale-95
                                active:brightness-90
                                px-4 py-2
                            `}
                        >
                            {leaving ? "Leaving..." : "Leave Community"}
                        </button>
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
        );
    }
    else {
        if (community.isPublic) {
            return (
                <label
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
                        border-2 border-line border-ink
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
                                    {initials.toUpperCase()}
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

                            <button 
                                type="button"
                                onClick={() => handleJoining()}
                                className={`
                                    rounded-lg
                                    text-inverse-ink
                                    bg-linear-to-b
                                    from-contrast-start
                                    via-contrast-middle
                                    to-contrast-end
                                    border-2 border-line border-ink
                                    hover:scale-105
                                    hover:brightness-110
                                    active:scale-95
                                    active:brightness-90
                                    px-4 py-2
                                `}
                            >
                                {joining ? "Joining..." : "Join Community"}
                            </button>
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
                </label>
            );
        }
        else {
            return;
        }
    }

}