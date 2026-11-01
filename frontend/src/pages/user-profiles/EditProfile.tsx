import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/useAuth"
import { useNavigate } from "react-router"
import type { User } from 'firebase/auth'
import type { PublicProfile, ScenarioTheme, SkillRating, UserPreferences, UserProfile } from '@/lib/schema/types'
import { BackButton } from "@/components/BackButton"
import { AvatarUploader } from "@/components/AvatarUploader";
import { SettingsButton } from "@/components/SettingsButton"
import { ProfileButton } from "@/components/ProfileButton"
import { processImage, updateBioPublicity, updateGenrePublicity, updateInstrumentPublicity, updateScenarioThemeAccompany, updateScenarioThemeAdvanced, updateScenarioThemeDefault, updateUserAvatar, updateUserBio, updateUsername, updateUserTheme } from "@/lib/profile/userProfile";
import { getAvatars, type Avatar } from "@/lib/profile/avatar";
import { getScenarioThemes, getUserElos, getUserScenarioTheme, getUserSettings } from "@/lib/profile/userSettings";
import type { UserSettings } from "@/lib/schema/types";
import { useTheme, type Theme } from "@/context/ThemeContext";
import { UsernameEditor } from "@/components/UsernameEditor";
import { BioEditor } from "@/components/BioEditor";
import { getUserPreferences, updatePreferredGenres, updatePreferredInstrument } from "@/lib/profile/userPreferences"; <s></s>
import { getPublicProfile, getUserStatus, updateDoNotDistrub, updateEloPublicity, updatePublicProfile } from "@/lib/profile/publicProfile";
import { NotificationButton } from "@/components/NotificationButton";
import { LiveElo } from "@/components/LiveElo";

type ProfileSection =
    | "profile"
    | "avatar"
    | "applicationTheme"
    | "scenarioTheme"
    | "presence";

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
    const [savedUsername, setSavedUsername] = useState("");
    const [avatars, setAvatars] = useState<Avatar[]>([]);
    const [showAllAvatars, setShowAllAvatars] = useState(false);
    const [, setAvatarsLoading] = useState(true);
   
    const [userSettings, setUserSettings] = useState<UserSettings>();
    const [userPreferences, setUserPreferences] = useState<UserPreferences>();
    const [publicProfile, setPublicProfile] = useState<PublicProfile>();

    const [draftTheme, setDraftTheme] = useState<Theme>();
    const [savedTheme, setSavedTheme] = useState<Theme>();

    const [scenarioThemes, setScenarioThemes] = useState<ScenarioTheme[]>([]);
    const [chosenScenarioTheme, setChosenScenarioTheme] = useState("");
    const [selectScenarioTheme, setSelectedScenarioTheme] = useState<ScenarioTheme>();
    const [chosenScenarioThemeUrl, setChosenScenarioThemeUrl] = useState("");
    const [needAccompanyingTheme, setNeedAccompanyingTheme] = useState(false);
    const [draftAccompanyTheme, setDraftAccompanyTheme] = useState<Theme>();
    const [needThemeName, setNeedThemeName] = useState(false);
    const [draftThemeName, setDraftThemeName] = useState("");

    const [draftBio, setDraftBio] = useState("");
    const [savedBio, setSavedBio] = useState("");

    const [instrument, setInstrument] = useState("");
    const [savedInstrument, setSavedInstrument] = useState("");

    const [eloRatings, setEloRatings] = useState<SkillRating[]>([]);
    
    const availableGenres = [ "blues", "jazz", "electronic", "hip-hop", "pop", "r&b", "rock", "indie", "alternative", "folk", "metal", ];
    const [draftGenres, setDraftGenres] = useState<string[]>([]);
    const [savedGenres, setSavedGenres] = useState<string[]>([]);
    const { setTheme } = useTheme();

    const [isProfilePublic, setProfilePublicity] = useState(true);
    const [isBioPublic, setBioPublicity] = useState(true);
    const [isInstrumentPublic, setInstrumentPublicity] = useState(true);
    const [publicGenres, setPublicGenres] = useState(true);
    const [publicElos, setPublicElos] = useState<string[]>([]);

    const [doNotDisturb, setDoNotDisturb] = useState(true)

    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const [uploading, setUploading] = useState(false);

    async function handleUpload( event: React.ChangeEvent<HTMLInputElement> ) {
        const file = event.target.files?.[0];
    
        if (!file) { 
            console.log('Debug: File Does Not Exist');
            return; 
        }    

        try {
            setUploading(true);

            const newScenarioThemeUrl = await processImage(file);
            setChosenScenarioThemeUrl(newScenarioThemeUrl);

            setNeedAccompanyingTheme(true);
            setNeedThemeName(true);

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

    function formatLabel(value: string) {
        return value
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase());
    }

    function toggleDraftGenre(genre: string) {
        setDraftGenres((currentGenres) => {
            if (currentGenres.includes(genre)) {
                return currentGenres.filter((current) => current !== genre);
            }

            return [...currentGenres, genre];
        });
    }

    function togglePublicElos(elo: string) {
        setPublicElos((currentElos) => {
            if (currentElos.includes(elo)) {
                return currentElos.filter((current) => current !== elo);
            }

            return [...currentElos, elo];
        });
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

            const scenarioThemes = await getScenarioThemes(user.uid);
            setScenarioThemes(scenarioThemes)
        } catch (error) {
            console.error("Failed to load user settings:", error);
        }
    }

    async function loadUserPreferences() {
        try {
            if (!user) {
                return;
            }
            const preferences = await getUserPreferences(user.uid);
            setUserPreferences(preferences)
        } catch (error) {
            console.error("Failed to load user preferences:", error);
        }
    }

    async function loadPublicProfile() {
        try {
            if (!user) {
                return;
            }
            setProfilePublicity(profile?.isProfilePublic ?? true)
            const userProfile = await getPublicProfile(user.uid);
            setPublicProfile(userProfile)
        } catch (error) {
            console.error("Failed to load public profile:", error);
        }
    }

    async function loadUserStatus() {
        try {
            if (!user) {
                return;
            }
            const userStatus = await getUserStatus(user.uid);
            setDoNotDisturb(userStatus?.dnd ?? false)
        } catch (error) {
            console.error("Failed to load user status:", error);
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
        loadUserPreferences();
        loadPublicProfile();
        loadUserStatus();
    }, []);

    useEffect(() => {
        async function loadThemes() {
            if (!user) {
                return;
            }
            switch(chosenScenarioTheme) {
                case "default":
                    setChosenScenarioThemeUrl('/default_mode.png');
                    return;
                case "dark":
                    setChosenScenarioThemeUrl('/dark_mode.png');
                    return;
                case "neon":
                    setChosenScenarioThemeUrl('/neon_mode.png');
                    return;
                case "deuteranopia":
                    setChosenScenarioThemeUrl('/deuteranopia_mode.png');
                    return;
                case "protanopia":
                    setChosenScenarioThemeUrl('/protanopia_mode.png');
                    return;
                case "tritanopia":
                    setChosenScenarioThemeUrl('/tritanopia_mode.png');
                    return;
                case "high-contrast":
                    setChosenScenarioThemeUrl('/high-contrast_mode.png');
                    return;
                case "":
                    setChosenScenarioTheme('default');
                    setChosenScenarioThemeUrl('/default_mode.png')
                    return;
                default:
                    const theme = await getUserScenarioTheme( user?.uid, chosenScenarioTheme );

                    if (theme != null) {
                        setSelectedScenarioTheme(theme);
                        setChosenScenarioTheme(theme.themeName);
                        setChosenScenarioThemeUrl(theme.themeUrl);
                    }
                    return;
            }
        }

        loadThemes();
    }, [chosenScenarioTheme]);

    useEffect(() => {
        if (!selectScenarioTheme) {return;}
        setChosenScenarioThemeUrl(selectScenarioTheme.themeUrl);
    }, [selectScenarioTheme]);

    useEffect(() => {
        setSavedUsername(profile?.displayName ?? "");
        
        setChosenScenarioTheme(userSettings?.scenarioTheme ?? "")

        setDraftBio(profile?.bio ?? "");
        setBioPublicity(userSettings?.publicBio ?? true);
        setSavedBio(profile?.bio ?? "");
        
        setDraftTheme(userSettings?.theme as Theme);
        setSavedTheme(userSettings?.theme as Theme);

        setInstrumentPublicity(userSettings?.publicInstrument ?? true);

        setPublicGenres(userSettings?.publicGenres ?? true);

        setTheme(userSettings?.theme as Theme);
    }, [userSettings]);

    useEffect(() => {
        setInstrument(userPreferences?.preferredInstrument ?? "");
        setSavedInstrument(userPreferences?.preferredInstrument ?? "");

        setDraftGenres(userPreferences?.preferredGenres ?? []);
        setSavedGenres(userPreferences?.preferredGenres ?? []);
    }, [userPreferences]);

    useEffect(() => {
        setPublicElos(publicProfile?.elos ?? []);
    }, [publicProfile]);

    const updateAllPublicity = async (profileToggle: boolean) => {
        if ( profileToggle ) {
            setProfilePublicity(profileToggle);
            setProfilePublicity(profileToggle);
            setBioPublicity(userSettings?.publicBio ?? true);
            setInstrumentPublicity(userSettings?.publicInstrument ?? true);
            setPublicElos(publicProfile?.elos ?? []);
            setPublicGenres(userSettings?.publicGenres ?? true);
        }
        else {
            setProfilePublicity(profileToggle);
            setBioPublicity(profileToggle);
            setInstrumentPublicity(profileToggle);
            setPublicElos([]);
            setPublicGenres(profileToggle);
        }
    }

    const handleThemeChange = async (uid: string, chosenTheme: Theme) => {
        setTheme(chosenTheme);
        await updateUserTheme(uid, chosenTheme);
        loadUserSettings();
    };

    const handleScenarioThemeChange = async (chosenTheme: string, chosenThemeUrl: string, accompany: boolean) => {
        setChosenScenarioTheme(chosenTheme);
        setChosenScenarioThemeUrl(chosenThemeUrl);
        setNeedAccompanyingTheme(accompany);
        setNeedThemeName(false);
    };

    const handleGeneralUpdates = async (uid: string, oldUsername: string, newUsername: string, bio: string, instrument: string, genres: string[], dnd: boolean) => {
        setError(null);
        setIsSaving(true);

        try {
            await Promise.all([
                updateUsername(uid, oldUsername, newUsername),
                updateUserBio(uid, isBioPublic, bio),
                updatePreferredInstrument(uid, isInstrumentPublic, instrument),
                updatePreferredGenres(uid, publicGenres, genres),
                updateDoNotDistrub(uid, dnd)
            ]);

            setSavedUsername(newUsername)
            await loadUserSettings();
            await loadUserPreferences();
            await loadPublicProfile();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to update user settings."
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handlePublicityUpdates = async (uid: string, profileStatus: boolean, bio: boolean, instrument: boolean, genres: boolean, elos: string[]) => {
        setError(null);
        setIsSaving(true);

        try {
            await Promise.all([
                updatePublicProfile(uid, savedUsername, profileStatus, bio, savedBio, instrument, savedInstrument, genres, savedGenres, elos),
                updateBioPublicity(uid, bio, savedBio),
                updateInstrumentPublicity(uid, instrument, savedInstrument),
                updateGenrePublicity(uid, genres, savedGenres),
                updateEloPublicity(uid, elos),
            ]);
            
            await loadUserSettings();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to update user publicity."
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleGeneralCancel = async () => {
        setDraftUsername(savedUsername);
        setDraftBio(savedBio);
        setDraftTheme(savedTheme);
        setInstrument(savedInstrument);
        setDraftGenres(savedGenres);
    };

    const handlePublicityCancel = async () => {
        setBioPublicity(userSettings?.publicBio ?? true);
        setInstrumentPublicity(userSettings?.publicInstrument ?? true);
        setPublicElos(publicProfile?.elos ?? []);
        setPublicGenres(userSettings?.publicGenres ?? true);
    };

    const updateScenarioThemeChanges = async () => {
        setError(null);
        setIsSaving(true);

        if (!user) {return;}

        try {
            if (needAccompanyingTheme){
                if (needThemeName) {
                    updateScenarioThemeAdvanced(user?.uid, draftThemeName, chosenScenarioThemeUrl, draftAccompanyTheme ?? "default");
                    setChosenScenarioTheme(draftThemeName);
                }
                else {
                    updateScenarioThemeAccompany(user?.uid, chosenScenarioTheme, draftAccompanyTheme ?? "default");
                    updateScenarioThemeDefault(user?.uid, chosenScenarioTheme);
                }
            }
            else {
                updateScenarioThemeDefault(user?.uid, chosenScenarioTheme);
            }
            
            await loadUserSettings();
        } catch (error) {
            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to update user settings."
            );
        } finally {
            setIsSaving(false);
        }
    };

    const displayedAvatars = showAllAvatars ? avatars : avatars.slice(0, 4);
    
    switch(selectedSetting) {
        case "presence":
            return (
                <div className="flex flex-col overscroll-contain m-4 gap-4">
                    <div className="flex flex-row justify-between bg-linear-to-b from-accent-start via-accent-middle to-accent-end outline-3 outline-accent-start rounded-lg px-6 py-4 mx-10">
                        <div className={`
                            rounded-lg
                            px-4 py-2
                            select-none
                            bg-linear-to-b
                            from-contrast-start
                            via-contrast-middle
                            to-contrast-end
                            text-ink
                            border-2
                            opacity-30%
                            border-line
                            brightness-60
                        `}>
                            Not On Public Profile
                        </div>
                        <div className="text-ink text-2xl font-bold mx-2 content-center">
                            Profile Publicity
                        </div>
                        <div className={`
                            rounded-lg
                            px-4 py-2
                            select-none
                            bg-linear-to-b
                            from-contrast-start
                            via-contrast-middle
                            to-contrast-end
                            text-ink
                            border-2
                            opacity-100%
                            border-contrast-start
                            brightness-100
                        `}>
                            Displayed On Public Profile
                        </div>
                    </div>
                    <div className="mx-8">
                        <p className="text-md font-medium text-accent-start select-none">
                            Profile Publicity:
                        </p>

                        <div className="mt-2">
                            <button
                                type="button"
                                onClick={() => updateAllPublicity(!isProfilePublic)}
                                aria-pressed={isProfilePublic}
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
                                    ${
                                        isProfilePublic
                                            ? `
                                                opacity-100%
                                                border-accent-start
                                                brightness-100
                                            `
                                            : `
                                                opacity-30%
                                                border-line
                                                brightness-60
                                            `
                                    }
                                    hover:scale-105
                                    active:scale-95
                                `}
                            >
                                {isProfilePublic ? "Public" : "Private"} Profile
                            </button>
                        </div>
                    </div>
                    {savedBio && savedBio.trim() !== "" && (
                        <div className="mx-8">
                            <label
                                htmlFor="bio"
                                className="text-md font-medium text-accent-start select-none"
                            >
                                Bio:
                            </label>
                            <div id="bio">
                                <button
                                    
                                    type="button"
                                    onClick={() => setBioPublicity(!isBioPublic)}
                                    aria-pressed={isBioPublic}
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
                                        ${
                                            isBioPublic
                                                ? `
                                                    opacity-100%
                                                    border-accent-start
                                                    brightness-100
                                                `
                                                : `
                                                    opacity-30%
                                                    border-line
                                                    brightness-60
                                                `
                                        }
                                        hover:scale-101
                                        active:scale-95
                                    `}
                                >
                                    {savedBio}
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="mx-8">
                        <label
                            htmlFor="preferredInstrument"
                            className="text-md font-medium text-accent-start select-none"
                        >
                            Preferred Instrument:
                        </label>
                        <div id="preferredInstrument">
                            <button
                                
                                type="button"
                                onClick={() => setInstrumentPublicity(!isInstrumentPublic)}
                                aria-pressed={isInstrumentPublic}
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
                                    ${
                                        isInstrumentPublic
                                            ? `
                                                opacity-100%
                                                border-accent-start
                                                brightness-100
                                            `
                                            : `
                                                opacity-30%
                                                border-line
                                                brightness-60
                                            `
                                    }
                                    hover:scale-105
                                    active:scale-95
                                `}
                            >
                                {formatLabel(savedInstrument)}
                            </button>
                        </div>
                    </div>
                    <div className="mx-8">
                        <p className="text-md font-medium text-accent-start select-none">
                            Preferred Genres:
                        </p>

                        <div className="mt-2">
                            <button
                                type="button"
                                onClick={() => setPublicGenres(!publicGenres)}
                                aria-pressed={publicGenres}
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
                                    ${
                                        publicGenres
                                            ? `
                                                opacity-100%
                                                border-accent-start
                                                brightness-100
                                            `
                                            : `
                                                opacity-30%
                                                border-line
                                                brightness-60
                                            `
                                    }
                                    hover:scale-105
                                    active:scale-95
                                `}
                            >
                                Publicize Preferred Genres
                            </button>
                        </div>
                    </div>
                    <div className="mx-8">
                        <label
                            htmlFor="elos"
                            className="text-md font-medium text-accent-start select-none"
                        >
                            Elos:
                        </label>
                        <div id="elos" className="flex flex-row overscroll-x-contain gap-4 mx-2">                           
                            {eloRatings.map((rating) => {
                                const isSelected = publicElos.includes(rating.instrument);
                                return (
                                    <button
                                        key={rating.instrument}
                                        type="button"
                                        onClick={() => togglePublicElos(rating.instrument)}
                                        aria-pressed={isSelected}
                                        className={`
                                            rounded-full
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
                                            ${
                                                isSelected
                                                    ? `
                                                        opacity-100%
                                                        border-accent-start
                                                        brightness-100
                                                    `
                                                    : `
                                                        opacity-30%
                                                        border-line
                                                        brightness-60
                                                    `
                                            }
                                            hover:scale-105
                                            active:scale-95
                                        `}
                                    >
                                        {formatLabel(rating.instrument)}-{rating.elo}
                                    </button>
                                );
                            })}
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
                                onClick={() => handlePublicityCancel()}
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
                                onClick={() => handlePublicityUpdates(user.uid, isProfilePublic, isBioPublic, isInstrumentPublic, publicGenres, publicElos)}
                            >
                                Save
                            </button>
                        </div>
                    )}
                </div>
            );
        case "profile":
            return (
                <div className="flex flex-col overscroll-contain m-4 gap-4">
                    {error && (
                        <div
                            role="alert"
                            className="
                                flex
                                items-center
                                justify-between
                                gap-4
                                rounded-lg
                                border-2
                                border-accent-start
                                bg-linear-to-b
                                from-accent-start
                                via-accent-middle
                                to-accent-end
                                brightness-85
                                opacity-80
                                px-4
                                py-3
                                text-inverse-ink
                            "
                        >
                            <div>
                                <p className="font-semibold">
                                    Update failed
                                </p>
                                <p className="text-sm">
                                    {error}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => setError(null)}
                                className="
                                    rounded-md
                                    px-2
                                    py-1
                                    text-lg
                                    hover:bg-contrast-start
                                "
                                aria-label="Dismiss error"
                            >
                                ×
                            </button>
                        </div>
                    )}
                    <UsernameEditor
                        username={draftUsername}
                        onUsernameDraftChanged={setDraftUsername}
                    />
                    <BioEditor
                        bio={draftBio}
                        onBioDraftChanged={setDraftBio}
                    />
                    <div className="flex flex-col gap-2">
                        <label
                            htmlFor="dndMode"
                            className="text-md font-medium text-accent-start select-none"
                        >
                            Set Do Not Disturb:
                        </label>
                        <div>
                            <button
                                id="dndMode"
                                type="button"
                                onClick={() => setDoNotDisturb(!doNotDisturb)}
                                aria-pressed={doNotDisturb}
                                className={`
                                    w-full
                                    rounded-lg
                                    py-2
                                    select-none
                                    bg-linear-to-b
                                    from-accent-start
                                    via-accent-middle
                                    to-accent-end
                                    text-ink
                                    transition
                                    duration-200
                                    border-2
                                    ${
                                        doNotDisturb
                                            ? `
                                                opacity-100%
                                                border-accent-start
                                                brightness-100
                                            `
                                            : `
                                                opacity-30%
                                                border-line
                                                brightness-60
                                            `
                                    }
                                    hover:scale-101
                                    active:scale-95
                                `}
                            >
                                Do Not Disturb
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label
                            htmlFor="preferredInstrument"
                            className="text-md font-medium text-accent-start select-none"
                        >
                            Preferred Instrument:
                        </label>
                        <select
                            id="preferredInstrument"
                            name="instrument"
                            value={instrument}
                            onChange={(e) => setInstrument(e.target.value)}
                            required
                            className={`
                                border
                                bg-linear-to-b
                                from-accent-start
                                via-accent-middle
                                to-accent-end
                                text-md text-ink
                                shadow-sm 
                                focus: border-line
                                focus:outline-none 
                                focus:ring-2 
                                focus:ring-accent-start
                                rounded-lg 
                                px-3 py-2 
                            `}
                        >
                            <option value="" disabled>Select an Instrument</option>
                            <option className="text-md text-black" value="piano">Piano</option>
                            <option className="text-md text-black" value="guitar">Guitar</option>
                            <option className="text-md text-black" value="woodwind">Woodwind</option>
                            <option className="text-md text-black" value="vocals">Vocals</option>
                            <option className="text-md text-black" value="midi">Midi</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-2">
                        <p className="text-md font-medium text-accent-start select-none">
                            Preferred Genres:
                        </p>

                        <div
                            className="flex flex-row gap-3 overscroll-x-auto mt-2"
                        >
                            {availableGenres.map((genre) => {
                                const isSelected = draftGenres.includes(genre);

                                return (
                                    <button
                                        key={genre}
                                        type="button"
                                        onClick={() => toggleDraftGenre(genre)}
                                        aria-pressed={isSelected}
                                        className={`
                                            rounded-full
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
                                            ${
                                                isSelected
                                                    ? `
                                                        opacity-100%
                                                        border-accent-start
                                                        brightness-100
                                                    `
                                                    : `
                                                        opacity-30%
                                                        border-line
                                                        brightness-60
                                                    `
                                            }
                                            hover:scale-105
                                            active:scale-95
                                        `}
                                    >
                                        {formatLabel(genre)}
                                    </button>
                                );
                            })}
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
                                onClick={() => handleGeneralCancel()}
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
                                onClick={() => handleGeneralUpdates(user.uid, profile?.usernameLower ?? "", draftUsername, draftBio, instrument, draftGenres, doNotDisturb)}
                            >
                                Save
                            </button>
                        </div>
                    )}
                </div>
            );
        case "avatar":
            return (
                <div className="flex w-full flex-col p-6">
                    <h1 className="text-3xl text-black">
                        Your Avatar
                    </h1>
                    <div className="flex w-full flex-col items-center mb-2">
                        <div className="flex items-center justify-center"> 
                            <img 
                                src={draftAvatar} 
                                alt={`${profile?.displayName ?? user?.email ?? "User"}'s Avatar`} 
                                className=" h-48 w-48 rounded-full object-cover outline-3 outline-contrast-start " 
                            />
                        </div>
                    </div>
                    <hr className="w-full border-4 border-t border-accent-start mb-2"/>
                    <div className={`
                        flex flex-col
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle via-60%
                        to-accent-end
                        rounded-md
                        p-4
                        mb-2
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
                                    onClick={() => setDraftAvatar(avatar.avatarUrl)}
                                >
                                    <img
                                        src={avatar.avatarUrl}
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
                                onClick={() => window.location.reload()}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={isSaving}
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
                                    transition
                                    ${isSaving
                                        ? "cursor-not-allowed opacity-50"
                                        : "hover:scale-105 active:scale-95"
                                    }
                                `}
                                onClick={() => updateUserAvatar(user.uid, draftAvatar)}
                            >
                                {isSaving ? "Saving..." : "Save"}
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
                    <div className="
                        flex flex-col
                        m-4
                        p-6
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                        outline-3
                        outline-accent-middle
                        rounded-lg
                        overflow-y-auto
                    ">
                        <h1 className="text-2xl text-ink font-bold mb-5">
                            Scenario Themes
                        </h1>

                        <div className="
                            bg-linear-to-b
                            from-contrast-start
                            via-contrast-middle
                            to-contrast-end
                            outline-2
                            outline-contrast-middle
                            rounded-lg
                            p-4
                        ">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="text-lg font-semibold text-ink">
                                    Selected Theme
                                </h2>

                                <span className="
                                    rounded-full
                                    bg-accent-start/20
                                    border
                                    border-accent-start
                                    px-3
                                    py-1
                                    text-sm
                                    text-ink
                                ">
                                    {formatLabel(chosenScenarioTheme || "default")}
                                </span>
                            </div>

                            <div className="
                                overflow-hidden
                                rounded-lg
                            ">
                                <img
                                    src={chosenScenarioThemeUrl}
                                    alt={`${chosenScenarioTheme} scenario theme preview`}
                                    className="
                                        w-full
                                        max-h-72
                                        object-contain
                                    "
                                />
                            </div>
                        </div>

                        <div className="mt-5">
                            <div className="
                                grid
                                grid-cols-2
                                md:grid-cols-3
                                gap-3
                            ">
                                <button
                                    type="button"
                                    onClick={() => handleScenarioThemeChange( savedTheme ?? "default", `/${savedTheme ?? "default"}_mode.png`, false ) }
                                    className={`
                                        group
                                        rounded-lg
                                        border-2
                                        p-2
                                        text-left
                                        transition
                                        duration-200
                                        ${
                                            chosenScenarioTheme === (savedTheme ?? "default")
                                                ? `
                                                    border-contrast-start
                                                    bg-contrast-start/60
                                                `
                                                : `
                                                    border-line
                                                    bg-contrast-start/40
                                                    hover:border-contrast-start
                                                    hover:bg-contrast-start/60
                                                `
                                        }
                                        hover:-translate-y-0.5
                                        active:scale-[0.98]
                                    `}
                                >
                                    <div className="px-1 pt-2">
                                        <img
                                            src={`/${savedTheme}_mode.png`}
                                            alt={`${savedTheme} preview`}
                                            className="
                                                w-full
                                                h-24
                                                object-cover
                                                transition
                                                duration-200
                                                group-hover:brightness-110
                                            "
                                        />
                                        <p className="font-medium text-ink">
                                            Application Theme
                                        </p>

                                        <p className="text-xs text-ink/60">
                                            Uses your current application theme
                                        </p>
                                    </div>
                                </button>

                                {scenarioThemes.map((theme) => {
                                    const isSelected = chosenScenarioTheme === theme.themeName;

                                    return (
                                        <button
                                            key={theme.themeName}
                                            type="button"
                                            onClick={() => handleScenarioThemeChange( theme.themeName, theme.themeUrl, true ) }
                                            className={`
                                                group
                                                rounded-lg
                                                border-2
                                                p-2
                                                text-left
                                                transition
                                                duration-200
                                                ${
                                                    isSelected
                                                        ? `
                                                            border-contrast-start
                                                            bg-contrast-start/60
                                                        `
                                                        : `
                                                            border-line
                                                            bg-contrast-start/40
                                                            hover:border-contrast-start
                                                            hover:bg-contrast-start/60
                                                        `
                                                }
                                                hover:-translate-y-0.5
                                                active:scale-[0.98]
                                            `}
                                        >
                                            <div className="
                                                overflow-hidden
                                                rounded-md
                                                border
                                                border-line
                                                bg-base
                                            ">
                                                <img
                                                    src={theme.themeUrl}
                                                    alt={`${theme.themeName} preview`}
                                                    className="
                                                        w-full
                                                        h-24
                                                        object-cover
                                                        transition
                                                        duration-200
                                                        group-hover:brightness-110
                                                    "
                                                />
                                            </div>

                                            <div className="px-1 pt-2">
                                                <p className="font-medium text-ink truncate">{theme.themeName}</p>

                                                <p className="text-xs text-ink/60">Custom scenario theme</p>
                                            </div>
                                        </button>
                                    );
                                })}

                                <label
                                    htmlFor="scenario-theme-upload"
                                    className="
                                        group
                                        flex
                                        min-h-40
                                        cursor-pointer
                                        flex-col
                                        items-center
                                        justify-center
                                        rounded-lg
                                        border-2
                                        border-dashed
                                        border-line
                                        bg-contrast-start/30
                                        p-4
                                        text-center
                                        transition
                                        hover:border-contrast-start
                                        hover:bg-contrast-start/60
                                        hover:-translate-y-0.5
                                    "
                                >
                                    <div className="
                                        flex
                                        h-10
                                        w-10
                                        items-center
                                        justify-center
                                        rounded-full
                                        border-2
                                        border-contrast-start
                                        text-xl
                                        text-contrast-start
                                        transition
                                        duration-200
                                        group-hover:scale-110
                                    ">
                                        +
                                    </div>

                                    <p className="mt-2 font-medium text-ink">
                                        Upload Theme
                                    </p>

                                    <p className="text-xs text-ink/60">
                                        PNG, JPG, WebP, or SVG
                                    </p>

                                    <input
                                        id="scenario-theme-upload"
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                        onChange={handleUpload}
                                        disabled={uploading}
                                        className="hidden"
                                    />
                                </label>
                            </div>
                        </div>

                        {(needAccompanyingTheme || needThemeName) && (
                            <div className="
                                mt-5
                                rounded-lg
                                border-2
                                border-line
                                bg-linear-to-b
                                from-contrast-start/70
                                via-contrast-middle/70
                                to-contrast-end/70
                                p-4
                            ">
                                <h2 className="text-lg font-semibold text-ink mb-3">
                                    Custom Theme Options
                                </h2>

                                <div className="flex flex-col gap-4">
                                    {needThemeName && (
                                        <div className="flex flex-col gap-2">
                                            <label
                                                htmlFor="themeName"
                                                className="
                                                    text-sm
                                                    font-medium
                                                    text-accent-start
                                                "
                                            >
                                                Theme Name
                                            </label>

                                            <input
                                                id="themeName"
                                                type="text"
                                                value={draftThemeName}
                                                onChange={(event) => setDraftThemeName(event.target.value)}
                                                className="
                                                    w-full
                                                    rounded-lg
                                                    border
                                                    border-line
                                                    bg-base
                                                    px-4
                                                    py-3
                                                    text-ink
                                                    outline-none
                                                    transition
                                                    focus:border-accent-start
                                                    focus:ring-2
                                                    focus:ring-accent-start/30
                                                "
                                                placeholder="Enter a theme name"
                                            />
                                        </div>
                                    )}

                                    {needAccompanyingTheme && (
                                        <div className="flex flex-col gap-2">
                                            <label
                                                htmlFor="accompanyTheme"
                                                className="
                                                    text-sm
                                                    font-medium
                                                    text-ink
                                                "
                                            >
                                                Application Theme
                                            </label>

                                            <select
                                                id="accompanyTheme"
                                                name="accompany-theme"
                                                value={draftAccompanyTheme ?? ""}
                                                onChange={(e) => setDraftAccompanyTheme(e.target.value as Theme)}
                                                required
                                                className="
                                                    w-full
                                                    rounded-lg
                                                    border
                                                    border-line
                                                    bg-linear-to-b
                                                    from-accent-start/80
                                                    via-accent-middle/80
                                                    to-accent-end/80
                                                    px-3
                                                    py-3
                                                    text-md
                                                    text-ink
                                                    outline-none
                                                    transition
                                                    focus:border-ink
                                                    focus:ring-2
                                                    focus:ring-ink/30
                                                "
                                            >
                                                <option value="" disabled>Select a Theme</option>
                                                <option value="default">Default</option>
                                                <option value="dark">Dark</option>
                                                <option value="neon">Neon</option>
                                                <option value="protanopia">Protanopia</option>
                                                <option value="deuteranopia">Deuteranopia</option>
                                                <option value="tritanopia">Tritanopia</option>
                                                <option value="high-contrast">High-Contrast</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {user && (
                            <div className="
                                flex
                                justify-end
                                gap-4
                                mt-6
                            ">
                                <button
                                    type="button"
                                    className="
                                        w-48
                                        rounded-lg
                                        bg-linear-to-b
                                        from-contrast-start
                                        via-contrast-middle
                                        to-contrast-end
                                        py-2
                                        transition
                                        hover:scale-105
                                        active:scale-95
                                    "
                                    onClick={() => window.location.reload()}
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    disabled={isSaving}
                                    className={`
                                        w-48
                                        rounded-lg
                                        bg-linear-to-b
                                        from-contrast-start
                                        via-contrast-middle
                                        to-contrast-end
                                        py-2
                                        transition
                                        ${
                                            isSaving
                                                ? "cursor-not-allowed opacity-50"
                                                : "hover:scale-105 active:scale-95"
                                        }
                                    `}
                                    onClick={updateScenarioThemeChanges}
                                >
                                    {isSaving ? "Saving..." : "Save"}
                                </button>
                            </div>
                        )}
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

                <div className="ml-auto flex items-center gap-3 sm:gap-4">
                    <NotificationButton uid={profile?.uid ?? ""}/>
                    <LiveElo />
                    <ProfileButton
                    className="w-36 shrink-0 sm:w-50"
                    username={profile?.displayName ?? user?.email ?? '…'}
                    userAvatar={profile?.avatarUrl ?? '../../favicon.svg'}
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
                        onClick={() => setSelectedSetting("presence")}
                        active={selectedSetting === "presence"}
                    >
                        My Presence
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