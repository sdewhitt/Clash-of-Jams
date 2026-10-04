import { useNavigate } from "react-router"
import { NavButton } from "@/components/NavButton";
import { BackButton } from "@/components/BackButton";
import { ProfileButton } from "@/components/ProfileButton"
import { useAuth } from "@/lib/auth/useAuth"
import { useState } from "react"

import { apiFetch } from "@/lib/api";
import type { Scenario } from "@/lib/schema/types";
import { useEffect } from "react";

export function ScenarioSearch() {
    
    // make edits here to make the API call

    const navigate = useNavigate()
    const { user, profile } = useAuth()
    
    const [search, setSearch] = useState('')

    const [scenarios, setScenarios] = useState<Scenario[]>([])

    useEffect(() => {
        const handler = setTimeout(() =>
            apiFetch<Scenario[]>("/scenarios/public").then(setScenarios).catch(console.error), 500
        );
        return() => clearTimeout(handler)
    }, [search])


    return (
        <main className="h-screen flex flex-col overflow-hidden">
            <header className={`
                flex 
                items-center
                justify-between
                bg-linear-to-r 
                from-accent-base-start from-10%
                via-accent-base-middle via-70%
                to-accent-base-end to-90%
                border-b-4
                border-accent-start 
                pt-6 
                pb-6
            `}>
                <div className="flex ml-12">
                    <BackButton></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">Scenario Search</h1>
                </div>
                <div className="mr-6">
                <ProfileButton
                    username={profile?.displayName ?? user?.email ?? "…"}
                    userAvatar={profile?.avatarUrl ?? "../../favicon.svg"}
                />
                </div>
            </header>

            <div className="px-12 pt-6 flex-1 min-h-0 flex items-stretch">
                <div className="w-full grid grid-cols-[2fr_1fr] gap-12 max-h-full">
                    <section className={`
                        h-full 
                        w-full 
                        rounded-xl 
                        border-4 
                        border-accent-start 
                        overflow-hidden 
                        flex 
                        flex-col
                    `}>
                        <header className={`
                            grid 
                            grid-cols-6 
                            gap-4 
                            items-center 
                            px-4 py-5 
                            bg-linear-to-b
                            from-accent-start
                            via-accent-middle
                            to-accent-end
                            brightness-110
                            border-b-3
                            border-accent-start
                        `}>
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search Scenarios"
                                className="col-span-2 w-full text-lg rounded-lg border-2 border-accent bg-white px-4 py-2 text-black"
                            />
                        </header>

                        <div className={`
                            flex-1 
                            min-h-0 
                            overflow-y-auto 
                            bg-linear-to-br
                            from-accent-start
                            via-accent-middle
                            to-accent-end
                            brightness-90
                            px-4 
                            py-4
                        `}>
                            {scenarios.map((scenario) => (
                                <div key={scenario.id}>{scenario.title}</div>
                            ))}
                        </div>
                    </section>
                    <section className={`
                        self-center 
                        aspect-video 
                        w-full 
                        rounded-xl 
                        border-3 
                        border-accent-start 
                        bg-linear-to-br
                        from-accent-base-start from-50
                        via-accent-base-middle
                        to-accent-base-end to-70
                        overflow-hidden
                    `}>
                        <img
                        src="../../favicon.svg"
                        alt="Clash of Jams Preview"
                        className="w-full h-full object-cover"
                        />
                    </section>
                </div>
            </div>
        </main>
    )
}