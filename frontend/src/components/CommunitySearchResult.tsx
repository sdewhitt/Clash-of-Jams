import type { Community } from "@/lib/schema/types";
import { useNavigate } from "react-router"

interface CommunitySearchResultProps {
    community: Community;
    member: boolean
}
  
export default function CommunitySearchResult({ community, member, }: CommunitySearchResultProps) {
    const navigate = useNavigate();
    const initials = community.name?.charAt(0) || "?";

    if (member) {
        return (
            <button
                type="button"
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
                    border border-line bg-surface p-3 text-left
                    transition 
                    hover:border-accent-soft
                    hover:bg-surface/80
                    focus-visible:outline-none
                    focus-visible:ring-2 focus-visible:ring-accent-soft
                `}
            >
                {community.communityIcon ? (
                    <img
                    src={community.communityIcon}
                    alt=""
                    className="h-12 w-12 rounded-full object-cover"
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
                    <p className="truncate font-lg">
                        {community.name}
                    </p>
                    <p className="mt-1 text-xs text-inverse-ink">
                        {community.description}
                    </p>
                </div>

                <span className="text-inverse-ink" aria-hidden="true">
                    →
                </span>
            </button>
        );
    }
    else {
        if (community.isPublic) {
            return;
        }
        else {
            return;
        }
    }

}