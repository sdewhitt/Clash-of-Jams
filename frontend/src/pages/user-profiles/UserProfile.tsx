import { useEffect, useState } from "react";
import { useNavigate } from "react-router"
import { useAuth } from "@/lib/auth/useAuth"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"
import { getUserSettings } from "@/lib/profile/UserSettings";
import type { UserSettings } from '@/lib/schema/types';

export function UserProfile() {
    const { user, profile, loading } = useAuth();
    const [userSettings, setUserSettings] = useState<UserSettings>();
    const [ elo, setElo ] = useState("");
    const [ bio, setBio ] = useState("");
    const [ preferredInstrument, setPreferredInstrument ] = useState("");
    const navigate = useNavigate();
    
    async function loadUserSettings() {
        try {
            if (!user) {
                return;
            }
            const settings = await getUserSettings(user.uid);
            setUserSettings(settings)
        } catch (error) {
            console.error("Failed to load user settings:", error);
        }
    }

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

    useEffect(
        () => { 
            if (loading) return; 
            loadUserSettings();
            }, [loading, profile, user]
    );

    useEffect(
        () => { 
            if (!userSettings) return; 
            setBio( profile?.bio ?? "" );
            setPreferredInstrument( userSettings?.preferredInstrument ?? "" );
            }, [userSettings]
    );


    function navPortal(location: string) {
        navigate(location)
    }
    
    return (
        <main className="h-screen flex flex-col">
            <header className={`
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
                    <div className="grid grid-cols-[1.5fr_3fr] gap-8 m-8">
                        <img 
                            src={profile?.avatarUrl ?? "../../favicon.svg"}
                            alt={`${profile?.displayName ?? user?.email ?? "…"}'s Avatar`}
                            className="w-3/4 aspect-square justify-center object-cover rounded-full outline-3 outline-contrast-middle"
                        />
                        <div className="h-full w-full flex flex-col justify-center gap-2">
                            <div className="flex justify-between">
                                <h2 className="text-ink text-6xl mx-4">{profile?.displayName ?? user?.email ?? "…"}</h2>
                                <h3 className="content-end text-ink text-4xl mx-4">{profile?.displayName ?? user?.email ?? "…"}</h3>
                            </div>
                            <div className="border-t-4 border-contrast-start" />
                            <h3 className="text-ink text-2xl mx-8">{bio ?? "…"}</h3>
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