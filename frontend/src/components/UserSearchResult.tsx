import { useOnlineStatus } from "@/lib/onlineStatus/useOnlineStatus";
import type { SearchProfile } from "@/lib/schema/types";
import { useNavigate } from "react-router"

interface UserSearchResultProps {
    profile: SearchProfile;
    communitySearch: boolean;
    communityFunction?: () => void;
}
  
export default function UserSearchResult({ profile, communitySearch, communityFunction, }: UserSearchResultProps) {
    const navigate = useNavigate();
    const { isOnline, dnd, loading } = useOnlineStatus(profile.uid);

    const relationshipText = (() => {
        switch (profile.relationship) {
        case "friend":
            return "Friends";

        case "friendOfFriend":
            return `${profile.mutualFriendCount} mutual ${
                profile.mutualFriendCount === 1
                    ? "friend"
                    : "friends"
            }`;

        default:
            return "Public profile";
        }
    })();

    const initials =
        profile.displayName?.charAt(0) ||
        profile.username.charAt(0) ||
        "?";

    return (
        <div
            onClick={() => navigate(`/profile/${encodeURIComponent(profile.uid)}`, { replace: true })}
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
                border border-line
                p-3 text-left
                transition 
                hover:border-accent-soft
                hover:bg-surface/80
                focus-visible:outline-none
                focus-visible:ring-2 focus-visible:ring-accent-soft
            `}
        >
            {profile.avatarUrl ? (
                <img
                src={profile.avatarUrl}
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
                <p className="truncate font-medium">
                    {profile.displayName || profile.username}
                </p>
                <p className="mt-1 text-xs text-inverse-ink">
                    {relationshipText}{loading ? "" : ` - ${dnd ? "Do Not Disturb" : `${isOnline ? "Online" : "Offline"}`}`}
                </p>
            </div>

            {communitySearch ? 
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        communityFunction?.();
                    }}
                    className={`
                        rounded-lg
                        bg-linear-to-b
                        from-contrast-start
                        via-contrast-middle
                        to-contrast-end
                        border border-line   
                        px-4 py-2 
                        hover:brightness-110
                        hover:scale-105
                        active:brightness-90
                        active:scale-95
                    `}
                >
                    +
                </button>
                :
                <span className="text-inverse-ink" aria-hidden="true">
                    →
                </span>
            }
        </div>
    );
}