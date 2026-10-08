import { useNavigate } from "react-router"
import { useAuth } from "@/lib/auth/useAuth"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "../components/ProfileButton"
import { InputLatencySetting } from "@/pages/settings/InputLatencySetting"

export function Settings() {
    const { user, profile } = useAuth()
    const navigate = useNavigate()

    function navPortal(location: string) {
        navigate(location)
    }

    return (
        <main className="h-screen flex flex-col">
            <header 
                className={`
                    flex 
                    items-center 
                    justify-between 
                    bg-linear-to-r 
                    from-accent-base-start from-10%
                    via-accent-base-middle via-70%
                    to-accent-base-end to-90%
                    border-b-4
                    border-accent-start 
                    py-6
                `}
            >
                <div className="flex ml-12">
                    <BackButton onClick={() => navPortal('/home')}></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">Settings</h1>
                </div>

                <div className="mr-6">
                    <ProfileButton
                        username={profile?.displayName ?? user?.email ?? "…"}
                        userAvatar={profile?.avatarUrl ?? "../../favicon.svg"}
                    />
                </div>
            </header>

            <div className="flex flex-1 min-h-0 flex-col items-center gap-6 overflow-y-auto px-6 py-8">
                {user && <InputLatencySetting uid={user.uid} />}

                <section className="flex w-full max-w-2xl flex-wrap items-center justify-between gap-4 rounded-xl border-3 border-accent-start bg-base-middle p-6">
                    <div>
                        <h2 className="text-2xl font-bold text-ink">Profile and appearance</h2>
                        <p className="text-sm text-muted">
                            Theme, preferred instrument, genres and what your profile shows.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => navPortal("/profile/edit_profile")}
                        className="rounded-xl border-3 border-accent-start bg-base-start px-6 py-3 font-bold text-ink hover:brightness-110 active:scale-[0.98]"
                    >
                        Open profile settings
                    </button>
                </section>
            </div>
        </main>
    )
}