import { useNavigate } from "react-router";
import { useState } from "react";

import { signOutCurrentUser } from "@/lib/auth/account";

type ProfileButtonProps = {
    username: string;
    userAvatar: string;
};

export function ProfileButton({ username, userAvatar }: ProfileButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const navigate = useNavigate();

    function navPortal(location: string) {
        navigate(location);
    }

    async function handleSignOut() {
        await signOutCurrentUser();
        // Replace so the back button does not land on a guarded page.
        navigate("/login", { replace: true });
    }

    return (
        <div className="relative w-40">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="group relative flex w-full items-center"
                aria-expanded={isOpen}
                aria-label="Open User Profile Menu"
            >
                <div
                    className={`
                        ml-5
                        h-10
                        w-full
                        flex
                        items-center
                        indent-5
                        outline-3
                        ${isOpen ? "outline-contrast" : "outline-contrast-soft"}
                        ${isOpen ? "bg-contrast-soft" : "bg-contrast"}
                        group-hover:bg-contrast-soft
                        transition-colors
                        truncate
                        ${isOpen ? "rounded-t-lg" : "rounded-r-lg"}
                        px-4
                    `}
                >
                    {username}
                </div>
                <div
                    className={`
                        absolute
                        left-0
                        h-12
                        w-12
                        outline-3
                        ${isOpen ? "outline-contrast" : "outline-contrast-soft"}
                        ${isOpen ? "bg-contrast-soft" : "bg-contrast"}
                        group-hover:bg-contrast-soft
                        transition-colors
                        overflow-hidden
                        rounded-full
                    `}
                >
                    <img
                        src={userAvatar}
                        alt={`${username}'s Avatar`}
                        className="h-full w-full object-cover"
                    />
                </div>
            </button>

            {isOpen && (
                <div
                    className="
                        absolute
                        z-20
                        mt-1
                        ml-10
                        w-9/12
                        flex
                        flex-col
                        outline-3
                        outline-contrast
                        overflow-hidden
                        rounded-b-lg
                        bg-contrast-soft
                        pb-1
                    "
                >
                    <button
                        className="py-1 hover:bg-contrast-soft-x2 hover:text-black transition-colors"
                        onClick={() => navPortal("/profile")}
                    >
                        My Profile
                    </button>
                    <div className="mx-1 border-t-4 border-contrast"></div>
                    <button
                        className="py-1 hover:bg-contrast-soft-x2 hover:text-black transition-colors"
                        onClick={() => navPortal("/friends/my_friends")}
                    >
                        My Friends
                    </button>
                    <div className="mx-1 border-t-4 border-contrast"></div>
                    <button
                        className="py-1 hover:bg-contrast-soft-x2 hover:text-black transition-colors"
                        onClick={handleSignOut}
                    >
                        Sign Out
                    </button>
                </div>
            )}
        </div>
    );
}