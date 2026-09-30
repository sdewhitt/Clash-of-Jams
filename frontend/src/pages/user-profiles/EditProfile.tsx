import { useAuth } from "@/lib/auth/useAuth"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"

export function EditProfile() {
    const { user, profile } = useAuth()
    
    return (
        <main className="h-screen flex flex-col">
            <header className="flex items-center justify-between bg-linear-to-r from-accent-base-start from-10 via-accent-base-middle via-80 to-accent-base-end to-90 border-b-4 border-accent-start py-6">
                <div className="flex ml-12">
                    <BackButton></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">Edit Profile</h1>
                </div>

                <div className="mr-6">
                    <ProfileButton
                        username={profile?.displayName ?? user?.email ?? "…"}
                        userAvatar={profile?.avatarUrl ?? "../../favicon.svg"}
                    />
                </div>
            </header>
            <div className=" grid grid-cols-[1fr_2fr] gap-8- m-8">
                <div className="flex flex-col w-full">
                    
                </div>
                <div className="flex flex-col w-full">

                </div>
            </div>
        </main>
    );
}