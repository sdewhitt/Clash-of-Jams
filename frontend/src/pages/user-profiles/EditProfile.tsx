import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/useAuth"
import { useNavigate } from "react-router"
import type { User } from 'firebase/auth'
import type { UserProfile } from '@/lib/schema/types'
import { BackButton } from "@/components/BackButton"
import { AvatarUploader } from "@/components/AvatarUploader";
import { SettingsButton } from "@/components/SettingsButton"
import { ProfileButton } from "@/components/ProfileButton"
import { updateUserAvatar, updateUserTheme } from "@/lib/profile/UserProfile";
import { getAvatars, type Avatar } from "@/lib/profile/Avatar";
import { getUserSettings, type userSettings } from "@/lib/profile/UserSettings";
import { useTheme, type Theme } from "@/context/ThemeContext";

type ProfileSection =
    | "profile"
    | "avatar"
    | "applicationTheme"
    | "scenarioTheme";

type ProfileEditContentProps = {
    selectedSetting: ProfileSection;
    user: User | null;
    profile: UserProfile | null;
    draftUsername: string;
    draftAvatar: string;
    setDraftUsername: React.Dispatch<React.SetStateAction<string>>;
    setDraftAvatar: React.Dispatch<React.SetStateAction<string>>;
};

function ProfileEditContent({ selectedSetting, user, profile, draftUsername, draftAvatar, setDraftUsername, setDraftAvatar } : ProfileEditContentProps) {
    const [avatars, setAvatars] = useState<Avatar[]>([]);
    const [showAllAvatars, setShowAllAvatars] = useState(false);
    const [, setAvatarsLoading] = useState(true);
    const [userSettings, setUserSettings] = useState<userSettings>();
    const [draftTheme, setDraftTheme] = useState<Theme>()
    const { setTheme } = useTheme()

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

    useEffect(() => {
        async function loadAvatars() {
            try {
                const avatarList = await getAvatars();
                setAvatars(avatarList);
            } catch (error) {
                console.error("Failed to load avatars:", error);
            } finally {
                setAvatarsLoading(false);
            }
        }

        loadAvatars();
        loadUserSettings();
    }, []);

    useEffect(() => {
        setDraftTheme(userSettings?.theme as Theme)
    }, [userSettings]);

    const handleThemeChange = async (uid: string, chosenTheme: Theme) => {
        setTheme(chosenTheme);
        await updateUserTheme(uid, chosenTheme);
        loadUserSettings();
    };

    const displayedAvatars = showAllAvatars ? avatars : avatars.slice(0, 4);
    
    switch(selectedSetting) {
        case "profile":
            return (
                <div>
                    Hello
                </div>
            );
        case "avatar":
            return (
                <div className="flex w-full flex-col gap-4 p-6">
                    <div className="relative flex items-center">
                        <h1 className="text-3xl text-ink">
                            Your Avatar
                        </h1>

                        <div className="absolute left-1/2 -translate-x-1/2">
                            <img
                                src={draftAvatar}
                                alt={`${profile?.displayName ?? user?.email ?? "User"}'s Avatar`}
                                className="h-48 w-48 rounded-full object-cover outline-3 outline-contrast-start"
                            />
                        </div>
                    </div>
                    <hr className="w-full border-4 border-t border-accent-start" />
                    <div className={`
                        flex flex-col
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle via-60%
                        to-accent-end
                        rounded-md
                        p-4
                        gap-4
                    `}>
                        <div className="flex justify-between">
                            <h1 className="text-3xl text-ink">
                                Avatars
                            </h1>
                            <button 
                                type="button"
                                onClick={() => setShowAllAvatars((previous) => !previous)}
                                className={`
                                    bg-linear-to-b
                                    from-contrast-start
                                    via-contrast-middle
                                    to-contrast-end
                                    hover:scale-105
                                    hover:brightness-125
                                    active:scale-95
                                    rounded-lg
                                    px-4
                                    py-2
                                `}
                            >
                                {showAllAvatars ? "Show Less" : "All Avatars"}
                            </button>
                        </div>
                        <div className={`
                            flex
                            grid
                            grid-cols-5
                            justify-center
                            overflow-y-auto
                            gap-4
                            px-4
                            py-2
                        `}>
                            {displayedAvatars.map((avatar) => (
                                <button
                                    key={avatar.aid}
                                    type="button"
                                    onClick={() => setDraftAvatar(avatar.url)}
                                >
                                    <img
                                        src={avatar.url}
                                        alt={avatar.name}
                                        className={`
                                            h-24 w-24
                                            rounded-full
                                            object-cover
                                            outline-3
                                            outline-contrast-start
                                            transition
                                            duration-200
                                            hover:scale-105
                                            hover:brightness-125
                                            active:scale-95
                                        `}
                                    />
                                </button>
                            ))}
                            <AvatarUploader
                                currentAvatarUrl={draftAvatar}
                                onAvatarUpdated={setDraftAvatar}
                            />
                        </div>
                    </div>
                    {user && (
                        <div className="flex justify-end">
                            <button
                                type="button"
                                className={`
                                    w-48
                                    rounded-lg 
                                    bg-linear-to-b
                                    from-accent-start
                                    via-accent-middle
                                    to-accent-end
                                    hover:scale-105
                                    active:scale-95
                                    py-2
                                    mr-4
                                `}
                                onClick={() => setDraftAvatar( profile?.avatarUrl ?? "../../favicon.svg" )}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={`
                                    w-48
                                    rounded-lg 
                                    bg-linear-to-b
                                    from-accent-start
                                    via-accent-middle
                                    to-accent-end
                                    hover:scale-105
                                    active:scale-95
                                    py-2
                                `}
                                onClick={() => updateUserAvatar(user.uid, draftAvatar)}
                            >
                                Save
                            </button>
                        </div>
                    )}
                </div>
            );
        case "applicationTheme":
            return (
                <div className="flex flex-col m-4 p-4 bg-linear-to-b from-accent-start via-accent-middle to-accent-end outline-3 outline-accent-middle rounded-lg">
                    <h1 className="text-2xl text-ink font-bold ml-8 mb-2 text-start">
                        Theme
                    </h1>

                    <div className="bg-linear-to-b from-contrast-start via-contrast-middle to-contrast-end outline-3 outline-contrast-middle rounded-lg p-4">
                        <img
                            src={`/${draftTheme}_mode.png`}
                            alt={`${draftTheme} Mode`}
                            className="w-4/5 mx-auto"
                        />

                        <div className="flex w-4/5 mx-auto">
                            <button
                                onClick={() => setDraftTheme("default")}
                                className="flex-auto whitespace-nowrap transition hover:bg-accent-start hover:underline rounded-bl-lg px-2 py-2"
                            >
                                Light
                            </button>

                            <button
                                onClick={() => setDraftTheme("dark")}
                                className="flex-auto whitespace-nowrap transition hover:bg-accent-start hover:underline px-2 py-2"
                            >
                                Dark
                            </button>

                            <button
                                onClick={() => setDraftTheme("neon")}
                                className="flex-auto whitespace-nowrap transition hover:bg-accent-start hover:underline px-2 py-2"
                            >
                                Neon
                            </button>

                            <button
                                onClick={() => setDraftTheme("deuteranopia")}
                                className="flex-auto whitespace-nowrap transition hover:bg-accent-start hover:underline px-2 py-2"
                            >
                                Deuteranopia
                            </button>

                            <button
                                onClick={() => setDraftTheme("protanopia")}
                                className="flex-auto whitespace-nowrap transition hover:bg-accent-start hover:underline px-2 py-2"
                            >
                                Protanopia
                            </button>

                            <button
                                onClick={() => setDraftTheme("tritanopia")}
                                className="flex-auto whitespace-nowrap transition hover:bg-accent-start hover:underline px-2 py-2"
                            >
                                Tritanopia
                            </button>

                            <button
                                onClick={() => setDraftTheme("high-contrast")}
                                className="flex-auto whitespace-nowrap transition hover:bg-accent-start hover:underline rounded-br-lg px-2 py-2"
                            >
                                High-Contrast
                            </button>
                        </div>
                    </div>

                    {user && (
                        <div className="flex justify-end gap-4 mt-6">
                            <button
                                type="button"
                                className="
                                    w-48
                                    rounded-lg
                                    bg-linear-to-b
                                    from-contrast-start
                                    via-contrast-middle
                                    to-contrast-end
                                    hover:scale-105
                                    active:scale-95
                                    py-2
                                "
                                onClick={() =>
                                    setDraftTheme(userSettings?.theme as Theme ?? "default")
                                }
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                className="
                                    w-48
                                    rounded-lg
                                    bg-linear-to-b
                                    from-contrast-start
                                    via-contrast-middle
                                    to-contrast-end
                                    hover:scale-105
                                    active:scale-95
                                    py-2
                                "
                                onClick={() =>
                                    handleThemeChange(user.uid, draftTheme ?? "default")
                                }
                            >
                                Save
                            </button>
                        </div>
                    )}
                </div>
            );
        case "scenarioTheme":
            return (
                <div>
                    Hello
                </div>
            );
    }
}

export function EditProfile() {
    const { user, profile, loading } = useAuth()
    const [draftUsername, setDraftUsername] = useState(""); 
    const [draftAvatar, setDraftAvatar] = useState("../../favicon.svg");
    const [selectedSetting, setSelectedSetting] = useState<ProfileSection>("profile");
    const navigate = useNavigate()

    function navPortal(location: string) {
        navigate(location)
    }

    useEffect(
        () => { 
            if (loading) return; 
            setDraftUsername( profile?.displayName ?? user?.email ?? "…" );
            setDraftAvatar( profile?.avatarUrl ?? "../../favicon.svg" );
         }, [loading, profile, user]
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

    return (
        <main className="h-screen flex flex-col">
            <header className="flex items-center justify-between bg-linear-to-r from-accent-base-start from-10 via-accent-base-middle via-80 to-accent-base-end to-90 border-b-4 border-accent-start py-6">
                <div className="flex ml-12">
                    <BackButton onClick={() => navPortal('/profile')}></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">Edit Profile</h1>
                </div>

                <div className="mr-6">
                    <ProfileButton
                        username={draftUsername}
                        userAvatar={draftAvatar}
                    />
                </div>
            </header>
            <div className="grid grid-cols-[1fr_2fr] h-full gap-8 m-8">
                <div className="flex flex-col w-full gap-6 justify-center">
                    <SettingsButton
                        onClick={() => setSelectedSetting("profile")}
                        active={selectedSetting === "profile"}
                    >
                        My Profile
                    </SettingsButton>
                    <SettingsButton
                        onClick={() => setSelectedSetting("avatar")}
                        active={selectedSetting === "avatar"}
                    >
                        My Avatar
                    </SettingsButton>
                    <SettingsButton
                        onClick={() => setSelectedSetting("applicationTheme")}
                        active={selectedSetting === "applicationTheme"}
                    >
                        Application Themes
                    </SettingsButton>
                    <SettingsButton
                        onClick={() => setSelectedSetting("scenarioTheme")}
                        active={selectedSetting === "scenarioTheme"}
                    >
                        Scenario Themes
                    </SettingsButton>
                </div>
                <div className={`
                    flex flex-col 
                    w-full 
                    bg-linear-to-br
                    from-contrast-start
                    via-contrast-middle
                    to-contrast-end
                    outline-4
                    outline-accent-start
                    rounded-lg
                    rounded-lg`
                }>
                    <ProfileEditContent 
                        selectedSetting={selectedSetting} 
                        user={user} 
                        profile={profile} 
                        draftUsername={draftUsername} 
                        draftAvatar={draftAvatar} 
                        setDraftUsername={setDraftUsername} 
                        setDraftAvatar={setDraftAvatar}
                    />
                </div>
            </div>
        </main>
    );
}