import { useNavigate } from "react-router"
import { useAuth } from "@/lib/auth/useAuth"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "../components/ProfileButton"

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
        </main>
    )
}