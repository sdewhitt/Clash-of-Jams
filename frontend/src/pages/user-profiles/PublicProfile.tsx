import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
import type { PublicProfile } from '@/lib/schema/types';
import { EloDisplay } from "@/components/EloDisplay";
import { useAuth } from "@/lib/auth/useAuth";
import { getPublicProfile } from "@/lib/profile/PublicProfile";
import { useSkillRatings } from "@/lib/ratings/useSkillRatings";

export function PublicProfile() {
    const { user, profile, loading } = useAuth();
    const { uid } = useParams<{ uid: string }>();
    const [ userProfile, setUserProfile ] = useState<PublicProfile>();
    const { ratings: eloRatings } = useSkillRatings(uid);
    const navigate = useNavigate();

    function formatLabel(value: string) {
        return value
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    async function loadPublicProfile() {
        if (!uid) {
            return;
        }

        try {
            const profile = await getPublicProfile(uid);
            setUserProfile(profile)

        } catch (error) {
            console.error("Failed to load public profile:", error);
        }
    }

    useEffect(
        () => { 
            loadPublicProfile()
            }, [uid]
    );

    if (loading) { 
        return ( 
            <main className="h-screen flex items-center justify-center"> 
                <div className="flex flex-col items-center gap-4"> 
                <div className="h-12 w-12 rounded-full border-4 border-accent-start border-t-transparent animate-spin" /> 
                    <p className="text-xl font-semibold text-ink"> Loading profile... </p> 
                </div> 
            </main> 
        ); 
    }

    function navPortal(location: string) {
        navigate(location)
    }
    
    return (
        <main className="flex flex-col">
            <header className={`
                sticky
                top-0
                z-50
                flex
                items-center
                justify-between
                bg-linear-to-r
                from-accent-base-start
                via-accent-base-middle
                to-accent-base-end
                border-b-4
                border-accent-start
                py-6`
            }>
                <div className="flex ml-12">
                    <BackButton onClick={() => navPortal('/friends/find_friends')}></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">View Public Profile</h1>
                </div>

                <div className="mr-6">
                    <ProfileButton
                        username={profile?.displayName ?? user?.email ?? "…"}
                        userAvatar={profile?.avatarUrl ?? "../../favicon.svg"}
                    />
                </div>
            </header>
            <div className="overscroll-contain px-6 py-6">
                <div className={`
                    relative
                    w-full 
                    bg-linear-to-b
                    from-accent-start
                    via-accent-middle
                    to-accent-end
                    outline-4
                    outline-accent-end
                    rounded-lg
                    py-8
                    mb-8`
                }>
                    <div className="grid grid-cols-[1.5fr_3fr] gap-2 m-8">
                        <img 
                            src={userProfile?.avatarUrl ?? "../../favicon.svg"}
                            alt={`${userProfile?.displayName ?? userProfile?.username ?? "…"}'s Avatar`}
                            className="w-3/4 aspect-square justify-center object-cover rounded-full outline-3 outline-contrast-middle"
                        />
                        <div className="h-full w-full flex flex-col justify-center gap-2">
                            <h2 className="select-none text-ink text-6xl mx-4">{userProfile?.displayName ?? userProfile?.username ?? "…"}</h2>
                            <div className="border-t-4 border-contrast-start" />
                            <div className="flex flex-col gap-2">
                                <div className="mx-8">
                                    <label
                                        htmlFor="publicBio"
                                        className="text-md font-medium text-contrast-start select-none"
                                    >
                                        User Bio:
                                    </label>

                                    <div
                                        id="publicBio"
                                        className={`
                                            w-fit
                                            select-none
                                            bg-linear-to-b
                                            from-contrast-start
                                            via-contrast-middle
                                            to-contrast-end
                                            rounded-full
                                            text-xl
                                            mx-2
                                            px-4 py-2
                                        `}
                                    >
                                        {userProfile?.bio && userProfile?.bio.trim() !== ""
                                            ? userProfile?.bio
                                            : "No user bio"}
                                    </div>
                                </div>
                                <div className="mx-8">
                                    <label
                                        htmlFor="preferredInstrument"
                                        className="text-md font-medium text-contrast-start select-none"
                                    >
                                        Preferred Instrument:
                                    </label>

                                    <div
                                        id="preferredInstrument"
                                        className={`
                                            w-fit
                                            select-none
                                            bg-linear-to-b
                                            from-contrast-start
                                            via-contrast-middle
                                            to-contrast-end
                                            rounded-full
                                            mx-2
                                            px-4 py-2
                                        `}
                                    >
                                        {userProfile?.preferredInstrument
                                            ? formatLabel(userProfile.preferredInstrument)
                                            : "No preferred instrument"}
                                    </div>
                                </div>
                                 <div className="mx-8">
                                    <label
                                        htmlFor="preferredGenres"
                                        className="text-md font-medium text-contrast-start select-none"
                                    >
                                        Preferred Genres:
                                    </label>
                                    <div id="preferredGenres" className="flex flex-row overscroll-x-contain gap-4 mx-2">
                                        {userProfile?.preferredGenres && userProfile?.preferredGenres?.length > 0 ? (
                                            userProfile.preferredGenres.map((genre) => (
                                                <div
                                                    key={genre}
                                                    className={`
                                                        w-fit
                                                        select-none
                                                        bg-linear-to-b
                                                        from-contrast-start
                                                        via-contrast-middle
                                                        to-contrast-end
                                                        rounded-full
                                                        px-4 py-2
                                                    `}
                                                >
                                                    {formatLabel(genre)}
                                                </div>
                                            ))
                                        ) : (
                                            <div
                                                className={`
                                                    w-fit
                                                    select-none
                                                    bg-linear-to-b
                                                    from-contrast-start
                                                    via-contrast-middle
                                                    to-contrast-end
                                                    rounded-full
                                                    px-4 py-2
                                                `}
                                            >
                                                No preferred music genres
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="mx-8">
                                    <label
                                        htmlFor="elos"
                                        className="text-md font-medium text-contrast-start select-none"
                                    >
                                        Elos:
                                    </label>
                                    <div id="elos" className="flex flex-row overscroll-x-contain gap-4 mx-2">                           
                                        {eloRatings.map((rating) => (
                                            <div key={rating.instrument}>
                                                <EloDisplay instrument={rating.instrument} tier={rating.tier} elo={rating.elo}/>
                                            </div>
                                        ))}
                                    </div> 
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={` 
                    w-full 
                    flex flex-col
                    bg-linear-to-b
                    from-accent-start from-50
                    via-accent-middle
                    to-accent-end to-70
                    outline-4
                    outline-accent-end
                    rounded-lg
                    py-8
                    mb-8`
                }>
                    <h1 className="ml-4 text-2xl">{userProfile?.displayName}'s Friends:</h1>
                    <div className="flex flex-col items-center">
                        {userProfile?.friends && userProfile?.friends?.length > 0 ? (
                            userProfile.friends.map((friend) => (
                                <div
                                    key={friend}
                                    className={`
                                        w-fit
                                        select-none
                                        bg-linear-to-b
                                        from-contrast-start
                                        via-contrast-middle
                                        to-contrast-end
                                        rounded-full
                                        px-4 py-2
                                    `}
                                >
                                    {friend}
                                </div>
                            ))
                        ) : (
                            <div
                                className={`
                                    w-fit
                                    select-none
                                    bg-linear-to-b
                                    from-contrast-start
                                    via-contrast-middle
                                    to-contrast-end
                                    rounded-full
                                    text-2xl
                                    px-4 py-2
                                `}
                            >
                                No Friends Associated With User Profile
                            </div>
                        )}
                    </div>
                </div>

                <div className={` 
                    w-full 
                    flex flex-col
                    bg-linear-to-b
                    from-accent-start from-50
                    via-accent-middle
                    to-accent-end to-70
                    outline-4
                    outline-accent-end
                    rounded-lg
                    py-8
                    mb-8`
                }>
                    <h1 className="ml-4 text-2xl">{userProfile?.displayName}'s Activity:</h1>
                    <div className="flex flex-col items-center">
                        {userProfile?.publicHistory ? 
                            <div className={` 
                                w-fit
                                select-none
                                bg-linear-to-b
                                from-contrast-start
                                via-contrast-middle
                                to-contrast-end
                                rounded-full
                                text-2xl
                                px-4 py-2
                            `}>
                                User Activity
                            </div>
                            :
                            <div className={` 
                                w-fit
                                select-none
                                bg-linear-to-b
                                from-contrast-start
                                via-contrast-middle
                                to-contrast-end
                                rounded-full
                                text-2xl
                                px-4 py-2
                            `}>
                                User's History is not Public
                            </div>
                        }
                    </div>
                </div>
            </div>
        </main>
    )
}