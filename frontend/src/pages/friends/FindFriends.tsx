import { useNavigate } from "react-router"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"

export function FindFriends() {  
    const navigate = useNavigate()

    function navPortal(location: string) {
        navigate(location)
    }

    return (
        <main className="h-screen flex flex-col overflow-hidden">
            <header className="flex items-center justify-between bg-accent-base border-b-2 border-accent pt-6 pb-5">
                <div className="flex ml-12">
                    <BackButton></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">Find Friends Page</h1>
                </div>
                <div className="mr-6">
                    <ProfileButton
                    username="Steve"
                    userAvatar="../../favicon.svg"
                    />
                </div>
            </header>
        </main>
    )
}