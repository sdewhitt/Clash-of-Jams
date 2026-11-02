import { useOnlineStatus } from "@/lib/onlineStatus/useOnlineStatus";
import type { SearchProfile } from "@/lib/schema/types";
import { useNavigate } from "react-router"

interface UserSearchResultProps {
    profile: SearchProfile;
}
  
export default function UserSearchResult({ profile, }: UserSearchResultProps) {
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
        <button
            type="button"
            onClick={() => navigate(`/profile/${profile.uid}`)}
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
                    justify-center rounded-full bg-base
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

            <span className="text-inverse-ink" aria-hidden="true">
                →
            </span>
        </button>
    );
}