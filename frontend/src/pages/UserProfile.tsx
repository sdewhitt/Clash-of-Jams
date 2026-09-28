import { useNavigate } from "react-router"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth/useAuth"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "../components/ProfileButton"

export function UserProfile() {
    const navigate = useNavigate()
    const { user, profile } = useAuth()

    function navPortal(location: string) {
        navigate(location)
    }
    
    return (
        <main className="h-screen flex flex-col overflow-hidden">
            <header className="flex items-center justify-between bg-accent-base border-b-2 border-accent py-6">
                <div className="flex ml-12">
                    <BackButton></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">My Profile</h1>
                </div>
                <div className="mr-6">
                    <ProfileButton
                        username={profile?.displayName ?? user?.email ?? "…"}
                        userAvatar={profile?.avatarUrl ?? "../../favicon.svg"}
                    />
                </div>
            </header>
            <div className="px-6 py-6">
                <div className="w-full bg-accent outline-4 outline-accent-soft rounded-lg py-8">

                </div>
            </div>
        </main>
    )
}