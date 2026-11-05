import { useNavigate, useParams } from "react-router";
import { useAuth } from "@/lib/auth/useAuth";
import { apiFetch } from "@/lib/api";
import { BackButton } from "@/components/BackButton";
import { ProfileButton } from "@/components/ProfileButton";
import { NotificationButton } from "@/components/NotificationButton";
import { LiveElo } from "@/components/LiveElo";
import { useEffect, useState } from "react";
import { INSTRUMENTS, type Community, type CommunityMembership, type CommunityRole, type Instrument, } from "@/lib/schema/types";
import { updateCommunity, updateCommunityMemberRole } from "@/lib/communities/communityManagement";
import { deleteCommunityNotification, subscribeCommunityNotifications, type CommunityNotification } from "@/lib/communities/communityNotifications";
import { getCommunityInformation } from "@/lib/communities/communitySearch";
import { processImage } from "@/lib/profile/userProfile";
import { CreateCommunityAnnouncement } from "@/components/CreateCommunityAnnouncement";
import type { LeaderboardResponse } from "@/lib/leaderboards";
import { LeaderboardRow, LeaderboardStat, MyStanding } from "@/components/Leaderboard";
import { CommunityInviteCard } from "@/components/CommunityInviteCard";
import type { ChangeEvent } from "react";

type CommunitySections =
    | "announcements"
    | "elos"
    | "members"
    | "settings";

const sections: { id: CommunitySections; label: string }[] = [
    { id: "announcements", label: "Announcements" },
    { id: "elos", label: "ELOs" },
    { id: "members", label: "Members" },
    { id: "settings", label: "Settings" },
];

type CommunityContentProps = {
    selectedSetting: CommunitySections;
    activeUid: string;
    community: Community;
    members: CommunityMembership[]
    onRoleChange: (uid: string, role: CommunityRole) => Promise<void>;
    refreshData: () => void;
};

function CommunityContent({selectedSetting, activeUid, community, members, onRoleChange, refreshData} : CommunityContentProps) {
    const navigate = useNavigate();

    const [communityIcon, setCommunityIcon] = useState<string | null>(community.communityIcon);
    // const [communityName, setCommunityName] = useState<string>(community.name);
    const [description, setDescription] = useState<string>(community.description);
    const [isPublic, setIsPublic] = useState(community.isPublic);

    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [instrument, setInstrument] = useState<Instrument>("piano");

    const [loadedLeaderboard, setLoadedLeaderboard] = useState<{
        instrument: Instrument;
        board: LeaderboardResponse | null;
    } | null>(null);

    const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

    const currentLeaderboard =
        loadedLeaderboard?.instrument === instrument
            ? loadedLeaderboard.board
            : null;

    const [showNotificationCreation, setShowNotificationCreation] = useState(false);
    const [notifications, setNotifications] = useState<CommunityNotification[]>([]);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    const [notificationsError, setNotificationsError] = useState<string | null>(null);

    const [showInviteMembers, setShowInviteMembers] = useState(false);

    const currentMembership = members.find(
        (member) => member.uid === activeUid
    );

    const memberRole = currentMembership?.role;

    async function handleUpload( event: ChangeEvent<HTMLInputElement> ) {
        const file = event.target.files?.[0];
    
        if (!file) { 
            console.log('Debug: File Does Not Exist');
            return; 
        }    

        try {
            setUploading(true);
            setError(null);

            const newIconUrl = await processImage(file);
            setCommunityIcon(newIconUrl);

        } catch (error) {
            console.error(error);

            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to upload avatar."
            );

        } finally {
            setUploading(false);
            event.target.value = "";
        }
    }

    async function handleRoleChange(uid: string, role: CommunityRole) {
        try {
            setError(null);

            await onRoleChange(uid, role);
        } catch (error) {
            console.error("Failed to update member role:", error);

            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to change user role."
            );
        }
    }

    async function handleCommunintyUpdates(mode: string) {
        if (mode === 'save') {
            try {
                setSubmitting(true);
                setError(null);
    
                await updateCommunity(community.id, communityIcon ?? "", description, isPublic);
                refreshData();
            } catch (error) {
                console.error("Failed to update member role:", error);
    
                setError(
                    error instanceof Error
                        ? error.message
                        : "Failed to change user role."
                );
            }
            finally {
                setSubmitting(false);
            }
        } 
        else {
            setCommunityIcon(community.communityIcon);
            // setCommunityName(community.name);
            setDescription(community.description);
            setIsPublic(community.isPublic);
        }
    }

    useEffect(() => {
        if (selectedSetting !== "announcements" || !memberRole) {
            setNotifications([]);
            setNotificationsLoading(false);
            return;
        }
    
        setNotifications([]);
        setNotificationsLoading(true);
        setNotificationsError(null);
    
        const unsubscribe = subscribeCommunityNotifications(
            community.id,
            memberRole,
            (updatedNotifications) => {
                setNotifications(updatedNotifications);
                setNotificationsLoading(false);
            },
            (error) => {
                console.error("Failed to retrieve announcements:", error);
    
                setNotificationsError(error.message);
                setNotificationsLoading(false);
            }
        );
    
        return () => {
            unsubscribe();
        };
    
    }, [selectedSetting, community.id, memberRole]);

    useEffect(() => {
        if (selectedSetting !== "elos") {
            return;
        }
    
        let cancelled = false;
    
        setLoadedLeaderboard(null);
        setLeaderboardError(null);
    
        apiFetch<LeaderboardResponse>(
            `/leaderboards/communities/${community.id}/elo?instrument=${instrument}`
        )
            .then((board) => {
                if (!cancelled) {
                    setLoadedLeaderboard({
                        instrument,
                        board
                    });
                }
            })
            .catch((error) => {
                console.error("Failed to load community leaderboard:", error);
    
                if (!cancelled) {
                    setLeaderboardError(
                        error instanceof Error
                            ? error.message
                            : "Failed to load community leaderboard."
                    );
                }
            });
    
        return () => {
            cancelled = true;
        };
    
    }, [selectedSetting, community.id, instrument]);

    switch(selectedSetting) {
        case "announcements":
            return (
                <div className="w-full h-full rounded-lg bg-radial from-accent-base-start via-accent-base-middle to-accent-base-end border-2 border-accent-start inset-shadow-sm">
                    <div className="flex flex-col gap-4 m-6">
                        {notificationsLoading ? (
                            <p className={`
                                text-center text-ink
                                rounded-lg
                                border border-line
                                bg-radial
                                from-accent-start
                                via-accent-middle
                                to-accent-end
                                p-4
                            `}>
                                Loading announcements...
                            </p>
                        ) : notificationsError ? (
                            <p className={`
                                text-center text-ink
                                rounded-lg
                                border border-line
                                bg-radial
                                from-accent-start
                                via-accent-middle
                                to-accent-end
                                p-4
                            `}>
                                {notificationsError}
                            </p>
                        ) : notifications.length === 0 ? (
                            <p className={`
                                text-center text-ink
                                rounded-lg
                                border border-line
                                bg-radial
                                from-accent-start
                                via-accent-middle
                                to-accent-end
                                p-4
                            `}>
                                No announcements available.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-4 overflow-scroll overscroll-contain">
                                    {notifications.map((notification) => (
                                        <div
                                            key={notification.id}
                                            className="
                                                flex flex-col gap-2
                                                rounded-lg
                                                border border-line
                                                bg-radial
                                                from-accent-start
                                                via-accent-middle
                                                to-accent-end
                                                p-4
                                            "
                                        >
                                            <div className="flex flex-row justify-between border-b-2">
                                                <h3 className="text-3xl font-semibold text-ink">
                                                    {notification.data.announcementTitle}
                                                </h3>
                                                {memberRole && memberRole !== 'member' && (
                                                    <button
                                                        onClick={() => deleteCommunityNotification(community.id, notification.id)}
                                                        className="text-lg text-ink hover:text-muted"
                                                    >
                                                        X
                                                    </button>
                                                )}
                                            </div>

                                            <p className="text-ink whitespace-pre-wrap">
                                                {notification.data.announcement}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                                {memberRole && memberRole !== 'member' && (
                                    <button
                                        type="button"
                                        onClick={() => setShowNotificationCreation(true)}
                                        className={`
                                            rounded-lg
                                            border border-line
                                            bg-radial
                                            from-contrast-start
                                            via-contrast-middle
                                            to-contrast-end
                                            text-lg font-semibold
                                            hover:brightness-110
                                            hover:scale-101
                                            active:brightness-90
                                            active:scale-99
                                            p-2
                                        `}
                                    >
                                        Create New Notification
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    {showNotificationCreation && (
                        <CreateCommunityAnnouncement
                            communityId={community.id}
                            announcerUid={activeUid}
                            onClose={() => setShowNotificationCreation(false)}
                        />
                    )}
                </div>
            );
        case "elos":
            return (
                <div className="
                    w-full h-full
                    rounded-lg
                    bg-radial from-accent-base-start via-accent-base-middle to-accent-base-end
                    border-2 border-accent-base-start
                    inset-shadow-sm
                    flex flex-col
                    overflow-hidden
                ">
                    <header className="
                        flex 
                        items-center 
                        justify-between
                        gap-4
                        border-b-2 border-line
                        bg-linear-to-r
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                        p-4
                    ">
                        <div>
                            <h2 className="text-2xl font-bold text-ink">
                                Community ELO Rankings
                            </h2>
        
                            <p className="text-sm text-inverse-ink">
                                Compete against members of {community.name}
                            </p>
                        </div>
        
                        <div className="flex items-center gap-3">
                            {currentLeaderboard && (
                                <span className="text-sm text-ink">
                                    {currentLeaderboard.totalPlayers} ranked players
                                </span>
                            )}
        
                            <select
                                value={instrument}
                                onChange={(e) =>
                                    setInstrument(e.target.value as Instrument)
                                }
                                aria-label="Instrument"
                                className="
                                    rounded-lg
                                    border-2 border-contrast-start
                                    bg-inverse-ink
                                    px-3 py-2
                                    text-ink
                                    capitalize
                                "
                            >
                                {INSTRUMENTS.map((name) => (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </header>
        
                    <div className="
                        flex-1 min-h-0
                        overflow-y-auto
                        bg-linear-to-br
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                        p-4
                    ">
                        {leaderboardError ? (
                            <p className="py-8 text-center text-ink">
                                {leaderboardError}
                            </p>
                        ) : currentLeaderboard === null ? (
                            <p className="py-8 text-center text-ink">
                                Loading community leaderboard...
                            </p>
                        ) : currentLeaderboard.entries.length === 0 ? (
                            <p className="py-8 text-center text-ink">
                                No ranked {instrument} players in this community yet.
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-3">
                                {currentLeaderboard.entries.map((entry) => (
                                    <LeaderboardRow
                                        key={entry.uid}
                                        entry={entry}
                                        highlighted={entry.uid === activeUid}
                                    >
                                        <LeaderboardStat label="ELO">
                                            {Math.round(entry.key)}
                                        </LeaderboardStat>
        
                                        <LeaderboardStat label="Tier">
                                            <span className="capitalize">
                                                {entry.skillRating?.tier ?? "—"}
                                            </span>
                                        </LeaderboardStat>
        
                                        <LeaderboardStat label="Games">
                                            {entry.skillRating?.gamesPlayed ?? "—"}
        
                                            {entry.skillRating?.isProvisional && (
                                                <span
                                                    title="Provisional: fewer than 10 games played"
                                                    className="ml-1 text-xs font-normal text-muted"
                                                >
                                                    (prov.)
                                                </span>
                                            )}
                                        </LeaderboardStat>
                                    </LeaderboardRow>
                                ))}
                            </ul>
                        )}
                    </div>
        
                    {currentLeaderboard && (
                        <MyStanding
                            board={currentLeaderboard}
                            emptyMessage={`Play an online ${instrument} match to get ranked.`}
                        />
                    )}
                </div>
            );
        case "members":
            return (
                <div className="w-full h-full rounded-lg bg-radial from-accent-base-start via-accent-base-middle to-accent-base-end border-2 border-accent-start inset-shadow-sm">
                    <div className="flex flex-col overflow-y-auto overscroll-contain gap-4 m-6">
                        {members.map((member) => {
                            const isCommunityOwner = member.uid === community.ownerUid;
                            const canModifyRoles = community.ownerUid === activeUid && !isCommunityOwner;

                            return (
                                <div
                                    key={member.uid}
                                    onClick={() => {
                                        if (member.uid === activeUid) return;
                                    
                                        navigate(`/profile/${encodeURIComponent(member.uid)}`, {
                                            replace: true,
                                        });
                                    }}
                                    className="
                                        rounded-lg
                                        flex flex-row
                                        items-center
                                        justify-between
                                        gap-4
                                        bg-radial
                                        from-accent-start
                                        via-accent-middle
                                        to-accent-end
                                        border border-line
                                        py-3 px-6
                                        cursor-pointer
                                        transition
                                        hover:brightness-110
                                    "
                                >
                                    <div className="flex flex-col min-w-0">
                                        <div className="text-xl font-semibold truncate">
                                            {member.userDisplayName}
                                        </div>

                                        <div className="text-sm">
                                            Member Since:{" "}
                                            {member.joinedAt.toDate().toLocaleDateString()}
                                        </div>
                                    </div>

                                    {canModifyRoles ? (
                                        <div
                                            className="shrink-0 w-32 h-10"
                                            onClick={(event) => event.stopPropagation()}
                                        >
                                            <select
                                                value={member.role}
                                                onChange={(event) =>
                                                    handleRoleChange(
                                                        member.uid,
                                                        event.target.value as CommunityRole
                                                    )
                                                }
                                                className="
                                                    w-full h-full
                                                    rounded-full
                                                    border-2 border-ink
                                                    bg-radial
                                                    from-contrast-start
                                                    via-contrast-middle
                                                    to-contrast-end
                                                    text-ink
                                                    text-sm font-semibold
                                                    text-center
                                                    cursor-pointer
                                                    outline-none
                                                    focus:border-accent-soft
                                                    hover:brightness-125
                                                    transition
                                                "
                                            >
                                                <option value="member">Member</option>
                                                <option value="moderator">Moderator</option>
                                            </select>
                                        </div>
                                    ) : (
                                        <div
                                            className="
                                                shrink-0
                                                inline-flex
                                                items-center
                                                justify-center
                                                h-10 w-32
                                                rounded-full
                                                border-2 border-ink
                                                bg-radial
                                                from-contrast-start
                                                via-contrast-middle
                                                to-contrast-end
                                                text-ink
                                                text-sm font-semibold
                                                capitalize
                                            "
                                        >
                                            {member.role}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <button
                            type="button"
                            onClick={() => setShowInviteMembers(true)}
                            className={`
                                rounded-lg
                                border border-line
                                bg-radial
                                from-contrast-start
                                via-contrast-middle
                                to-contrast-end
                                text-lg font-semibold
                                hover:brightness-110
                                active:brightness-90
                                active:scale-99
                                p-2
                            `}
                        >
                            + Invite Users to {community.name}
                        </button>
                    </div>
                    {showInviteMembers && (
                        <CommunityInviteCard
                            communityId={community.id}
                            searcherUid={activeUid}
                            members={members}
                            onClose={() => setShowInviteMembers(false)}
                        />
                    )}
                </div>
            );
        case "settings":
            return (
                <div className="w-full h-full rounded-lg bg-radial from-accent-base-start via-accent-base-middle to-accent-base-end border-2 border-accent-start inset-shadow-sm overflow-scroll overscroll-contain">
                    <div className="flex flex-col items-center gap-4 m-6">
                        <div className="flex flex-col gap-2">
                            <div className="w-full flex text-left text-md font-medium text-accent-start select-none">
                                Community Icon:
                            </div>
                            <div className="relative h-36 w-36">
                                <label
                                    htmlFor="community-icon-upload"
                                    className="block h-36 w-36 cursor-pointer overflow-hidden rounded-full outline-3 outline-accent-start transition duration-200 hover:scale-105 hover:brightness-125 active:scale-95"
                                >
                                    <img
                                        src={communityIcon ? communityIcon : '/upload.png'}
                                        alt="Community Icon"
                                        className="h-full w-full rounded-full object-cover bg-contrast-end"
                                    />

                                    <input
                                        id="community-icon-upload"
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                        onChange={handleUpload}
                                        disabled={uploading}
                                        className="hidden"
                                    />
                                </label>
                            </div>
                        </div>
                        {/* <div className="w-full flex flex-col gap-2">
                            <p className="text-md font-medium text-accent-start select-none">
                                Community Name:
                            </p>

                            <input
                                id="communityNameInput"
                                type="text"
                                value={communityName ?? ""}
                                onChange={(event) => setCommunityName(event.target.value)}
                                className="
                                    rounded-lg
                                    border
                                    border-line
                                    bg-linear-to-b
                                    from-accent-start
                                    via-accent-middle
                                    to-accent-end
                                    px-4
                                    py-3
                                    text-ink
                                    outline-none
                                    focus:border-accent-start
                                "
                                placeholder="Enter community's name..."
                            />
                        </div> */}

                        <div className="w-full flex flex-col gap-2">
                            <label
                                htmlFor="communityDescription"
                                className="text-md font-medium text-accent-start select-none"
                            >
                                Community Description:
                            </label>

                            <textarea
                                id="communityDescription"
                                value={description ?? ""}
                                onChange={(event) => setDescription(event.target.value)}
                                className="
                                    w-full
                                    min-h-32
                                    resize-y
                                    rounded-lg
                                    border
                                    border-line
                                    bg-linear-to-b
                                    from-accent-start
                                    via-accent-middle
                                    to-accent-end
                                    px-4
                                    py-3
                                    text-ink
                                    outline-none
                                    focus:border-accent-start
                                "
                                placeholder="Enter community's description..."
                            />
                        </div>

                        <div className="w-full flex flex-col gap-2">
                            <label
                                htmlFor="communityPublicity"
                                className="text-md font-medium text-accent-start select-none"
                            >
                                Community Publicity:
                            </label>

                            <button
                                id="communityPublicity"
                                type="button"
                                onClick={() => setIsPublic(!isPublic)}
                                aria-pressed={isPublic}
                                className={`
                                    w-full
                                    rounded-lg
                                    px-4 py-2
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
                                {isPublic ? "Public" : "Private"}
                            </button>
                        </div>
                        {error && (
                            <p 
                                role="alert" 
                                className={
                                    `mt-4 
                                    text-sm font-bold text-center text-ink
                                `}
                            >
                                {error}
                            </p>
                        )}
                        <footer className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => handleCommunintyUpdates('cancel')}
                                disabled={submitting}
                                className="
                                    rounded-lg
                                    bg-radial
                                    from-accent-start
                                    via-accent-middle 
                                    to-accent-end
                                    px-5 py-2 font-semibold text-inverse-ink
                                    border border-2 border-ink
                                    hover:brightness-110
                                    disabled:cursor-not-allowed
                                    disabled:opacity-80
                                "
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={() => handleCommunintyUpdates('save')}
                                disabled={submitting}
                                className="
                                    rounded-lg
                                    bg-radial
                                    from-accent-start
                                    via-accent-middle 
                                    to-accent-end
                                    px-5 py-2 font-semibold text-inverse-ink
                                    border border-2 border-ink
                                    hover:brightness-110
                                    disabled:cursor-not-allowed
                                    disabled:opacity-80
                                "
                            >
                                {submitting ? "Saving..." : "Save Changes"}
                            </button>
                        </footer>
                    </div>
                </div>
            );
        default:
            return;
    }
}

export function UserCommunity() {
    const { user, profile } = useAuth();
    const { communityId } = useParams<{ communityId: string }>();
    const navigate = useNavigate();

    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [community, setCommunity] = useState<Community | null>(null);
    const [members, setMembers] = useState<CommunityMembership[]>([]);

    const [selectedSetting, setSelectedSetting] = useState<CommunitySections>("announcements");
    const [initials, setInitials] = useState<string>("");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    async function handleMemberRoleChange( uid: string, role: CommunityRole ) {
        if (!community || !profile) {
            throw new Error("Community information is unavailable.");
        }
    
        if (uid === community.ownerUid) {
            throw new Error("The community owner's role cannot be modified.");
        }
    
        if (!communityId) {
            throw new Error("Invalid community ID.");
        }
    
        await updateCommunityMemberRole(communityId, uid, role);
    
        setMembers((previousMembers) =>
            previousMembers.map((member) =>
                member.uid === uid
                    ? { ...member, role }
                    : member
            )
        );
    }

    useEffect(() => {
        let isActive = true;

        async function fetchCommunity() {
            if (!communityId) {
                setError("Invalid community ID.");
                setLoading(false);
                return;
            }

            setLoading(true);
            setError(null);

            try {
                const information = await getCommunityInformation(communityId);

                if (!isActive) return;

                if (!information) {
                    setError("Community not found.");
                    return;
                }

                setCommunity(information.community);
                setMembers(information.members);
                setInitials(information.community.name.charAt(0))

            } catch (err) {
                console.error("Failed to retrieve community:", err);

                if (isActive) {
                    setError("Unable to load community information.");
                }
            } finally {
                if (isActive) {
                    setLoading(false);
                }
            }
        }

        fetchCommunity();

        return () => {
            isActive = false;
        };
    }, [communityId, refreshTrigger]);

    return (
        <main className="h-screen flex flex-col overflow-hidden">
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
                    <h1 className="ml-4 text-4xl font-bold text-ink">{community?.name ?? "..."}</h1>
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

            {loading && (
                <div className="flex min-h-screen flex-col items-center justify-center gap-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-accent-start border-t-transparent" />
        
                    <h1 className="text-3xl font-bold text-ink">
                        Loading community information...
                    </h1>
                </div>
            )}

            {error && (
                <div
                    className={`
                        flex flex-col
                        items-center
                        w-full
                    `}
                >
                    <h1 className={`
                        bg-linear-to-b
                        from-accent-base-start
                        via-accent-base-middle
                        to-accent-base-end
                        text-5xl text-center
                        border-4
                        border-accent-start
                        rounded-2xl
                        m-24
                        p-12
                    `}>
                        {error}
                    </h1>
                </div>
            )}

            {community && members && user && profile && (
                <div className="flex flex-col mx-12 my-6">
                    <div className="
                        flex flex-row items-center
                        gap-6
                        border-b-4 border-accent-start
                        pb-6
                    ">
                        {community.communityIcon ? (
                            <img
                                src={community.communityIcon}
                                alt=""
                                className="
                                    ml-6 h-32 w-32
                                    rounded-full
                                    object-cover
                                    outline-4 outline-accent-start
                                "
                            />
                        ) : (
                            <div className="
                                ml-6 shrink-0
                                flex justify-center items-center
                                h-32 w-32
                                rounded-full
                                bg-accent-base-start
                                text-4xl font-semibold text-ink
                            ">
                                {initials.toUpperCase()}
                            </div>
                        )}

                        <h1 className="text-6xl font-bold text-accent-start">
                            {community.name}
                        </h1>
                    </div>

                    <nav className="flex w-full items-stretch rounded-b-lg">
                        {sections.map((section) => {
                            const isSelected = selectedSetting === section.id;
                            if ((section.id !== 'settings') || ((profile.uid === community.ownerUid) && (section.id === 'settings'))) {
                                return (
                                    <button
                                        key={section.id}
                                        onClick={() => setSelectedSetting(section.id)}
                                        className={`
                                            relative
                                            flex-1
                                            flex items-center justify-center
                                            first:rounded-bl-2xl
                                            last:rounded-br-2xl
                                            py-2 px-6
                                            text-lg font-semibold
                                            transition-all duration-200
                                            ${isSelected
                                                ? `
                                                    text-accent-soft
                                                    border-accent-start
                                                    bg-accent-start
                                                `
                                                : `
                                                    text-muted
                                                    bg-accent-start/40
                                                    hover:text-ink
                                                    hover:bg-accent-start/60
                                                `
                                            }
                                        `}
                                    >
                                        {section.label}
                                    </button>
                                );
                            }
                            else {
                                return;
                            }
                        })}
                    </nav>

                    <div className="flex-1 min-h-0 overflow-y-auto p-6 mx-2 my-2">
                        <CommunityContent
                            selectedSetting={selectedSetting}
                            activeUid={profile.uid}
                            community={community}
                            members={members}
                            onRoleChange={handleMemberRoleChange}
                            refreshData={() => setRefreshTrigger(prev => prev + 1)}
                        />
                    </div>
                </div>
            )}
        </main>
    );
}
