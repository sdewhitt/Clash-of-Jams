import { useNavigate } from "react-router"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth/useAuth"
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"

export function MyCommunities() {
    const navigate = useNavigate()
    const { user, profile } = useAuth()
    const [search, setSearch] = useState<string>("");
    const [, setCommunitySearch] = useState<string>("");
    {/*Add a variable to track search state to determine whether or not there are any results to customize look of page*/}
    
    useEffect(() => {
        const handler = setTimeout(() => setCommunitySearch(search), 500);
        return () => clearTimeout(handler);
    }, [search]);

    {/*Add a useEffect for search engine functionality*/}

    function navPortal(location: string) {
        navigate(location)
    }
    
    return (
        <main className="h-screen flex flex-col overflow-hidden">
            <header className="flex items-center justify-between bg-linear-to-r from-accent-base-start from-10 via-accent-base-middle via-80 to-accent-base-end to-90 border-b-4 border-accent-start py-6">
                <div className="flex ml-12">
                    <BackButton></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">Jamming With Your Friends</h1>
                </div>
                <div className="mr-6">
                    <ProfileButton
                        username={profile?.displayName ?? user?.email ?? "…"}
                        userAvatar={profile?.avatarUrl ?? "../../favicon.svg"}
                    />
                </div>
            </header>
            <div className="px-6 py-6">
                <div className={`
                    flex 
                    w-fill
                    justify-between
                    rounded-lg
                    bg-linear-to-b
                    from-accent-start from-30
                    via-accent-middle
                    to-accent-end to-90
                    border-4
                    border-accent-start
                    px-6
                    py-4`
                }>
                    <h1 className="text-2xl font-bold mt-2">Your Communities</h1>
                    <button 
                        className={`
                            rounded-lg
                            bg-linear-to-b 
                            from-contrast-start from-50 
                            via-contrast-middle 
                            to-contrast-end to-70
                            outline-3
                            outline-contrast-middle
                            text-ink
                            hover:brightness-125
                            active:scale-95 
                            px-3 
                            py-3`
                        } 
                        onClick={() => navPortal("/friends/find_communities")}
                    >
                        Add a Community
                    </button>
                </div>
                <div className="px-8 pt-6">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search communities by name"
                        className={`
                            w-full 
                            px-2 py-2 
                            rounded-lg 
                            bg-accent-middle 
                            text-ink 
                            outline-2 
                            outline-accent-start 
                            focus:outline-none 
                            focus:ring-3 
                            focus:ring-accent-end 
                            transition-all`
                        }
                    />
                </div>
            </div>
        </main>
    )
}