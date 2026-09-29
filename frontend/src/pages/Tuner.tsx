import { useNavigate } from "react-router"
import { useAuth } from "@/lib/auth/useAuth"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "../components/ProfileButton"

export function Tuner() {
    const navigate = useNavigate()
    const { user, profile } = useAuth()

    function navPortal(location: string) {
        navigate(location)
    }

    return (
        <main className="h-screen flex flex-col">
            <header className="flex items-center justify-between bg-linear-to-r from-accent-base-start from-10 via-accent-base-middle via-80 to-accent-base-end to-90 border-b-2 border-accent py-6">
                <div className="flex ml-12">
                    <BackButton></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">Tuner</h1>
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