import { useEffect, useState } from "react";
import { useNavigate } from "react-router"
import { useAuth } from "@/lib/auth/useAuth"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
import { getUserElos, getUserSettings } from "@/lib/profile/UserSettings";
import type { SkillRating, UserSettings } from '@/lib/schema/types';
import { EloDisplay } from "@/components/EloDisplay";

export function UserProfile() {
    const { user, profile, loading } = useAuth();
    const [userSettings, setUserSettings] = useState<UserSettings>();
    const [ preferredInstrument, setPreferredInstrument ] = useState("");
    const [ eloRatings, setEloRatings] = useState<SkillRating[]>([]);
    const navigate = useNavigate();

    function formatLabel(value: string) {
        return value
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase());
    }
    
    async function loadUserSettings() {
        try {
            if (!user) {
                return;
            }
            const settings = await getUserSettings(user.uid);
            setUserSettings(settings)

            const elos = await getUserElos(user.uid);
            setEloRatings(elos);
        } catch (error) {
            console.error("Failed to load user settings:", error);
        }
    }

    useEffect(
        () => { 
            if (loading) return; 
            loadUserSettings();
            }, [loading, profile, user]
    );

    useEffect(
        () => { 
            if (!userSettings) return;
            setPreferredInstrument( userSettings?.preferredInstrument ?? "" );
            }, [userSettings]
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
                    <BackButton onClick={() => navPortal('/home')}></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">My Profile</h1>
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
                    <button className="absolute top-8 right-8 text-5xl hover:opacity-70 hover:scale-105 active:scale-95" onClick={() => navPortal('/profile/edit_profile')}>
                        ✎
                    </button>
                    <div className="grid grid-cols-[1.5fr_3fr] gap-2 m-8">
                        <img 
                            src={profile?.avatarUrl ?? "../../favicon.svg"}
                            alt={`${profile?.displayName ?? user?.email ?? "…"}'s Avatar`}
                            className="w-3/4 aspect-square justify-center object-cover rounded-full outline-3 outline-contrast-middle"
                        />
                        <div className="h-full w-full flex flex-col justify-center gap-2">
                            <h2 className="select-none text-ink text-6xl mx-4">{profile?.displayName ?? user?.email ?? "…"}</h2>
                            <div className="border-t-4 border-contrast-start" />
                            <div className="flex flex-col gap-2">
                                {profile && profile.bio.trim() !== "" && (
                                    <h3 className="select-none text-ink text-xl mx-8">
                                        {profile.bio}
                                    </h3>
                                )}
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
                                        {formatLabel(preferredInstrument)}
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
                                        {userSettings?.preferredGenres.map((genre) => (
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
                                        ))}
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
                    Friends
                </div>

                <div className={` 
                    w-full 
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
                    Activity
                </div>
            </div>
        </main>
    )
}