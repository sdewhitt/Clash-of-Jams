import { useNavigate } from "react-router"
import { useEffect, useState } from "react";
import { BackButton } from "@/components/BackButton"
import { ProfileButton } from "@/components/ProfileButton"

export function MyFriends() {
    const navigate = useNavigate()
    const [search, setSearch] = useState<string>("");
    const [friendSearch, setFriendSearch] = useState<string>("");
    {/*Add a variable to track search state to determine whether or not there are any results to customize look of page*/}
    
    useEffect(() => {
        const handler = setTimeout(() => setFriendSearch(search), 500);
        return () => clearTimeout(handler);
    }, [search]);

    {/*Add a useEffect for search engine functionality*/}

    function navPortal(location: string) {
        navigate(location)
    }
    
    return (
        <main className="h-screen flex flex-col overflow-hidden">
            <header className="flex items-center justify-between bg-accent-base border-b-2 border-accent py-6">
                <div className="flex ml-12">
                    <BackButton></BackButton>
                    <h1 className="ml-4 text-4xl font-bold text-ink">Jamming With Your Friends</h1>
                </div>
                <div className="mr-6">
                    <ProfileButton
                    username="Steve"
                    userAvatar="../../favicon.svg"
                    />
                </div>
            </header>
            <div className="px-6 py-6">
                <div className="flex w-fill justify-between rounded-lg bg-accent border-2 border-accent-soft px-6 py-4">
                    <h1 className="text-2xl font-bold mt-2">Your Friends</h1>
                    <button className="rounded-lg outline-3 outline-contrast-soft bg-contrast hover:bg-contrast-soft hover:outline-contrast hover:text-inverse-ink active:scale-95 px-3 py-3" onClick={() => navPortal("/friends/find_friends")}>Add a Friend</button>
                </div>
                <div className="px-8 pt-6">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search friends by name"
                        className="w-full px-2 py-2 rounded-lg bg-accent-soft-x2 text-inverse-ink outline-2 outline-accent-soft focus:outline-none focus:ring-3 focus:ring-accent transition-all"
                    />
                </div>
                {/*Swap the code below to be tied to a variable to determine whether they have any friends that match the search bar (if there is anything there)*/}
                <div className="px-12 py-6">
                    <h1 className="text-2xl font-bold text-muted">Online:</h1>
                </div>
                <div className="px-12 py-6">
                    <h1 className="text-2xl font-bold text-muted">Offline:</h1>
                </div>
            </div>
        </main>
    )
}