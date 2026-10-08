import { useNavigate } from "react-router";
import { useState } from "react";
import { useTheme } from "@/context/ThemeContext";

import { signOutCurrentUser } from "@/lib/auth/account";

type ProfileButtonProps = {
    username: string;
    userAvatar: string;
    className?: string;
};

export function ProfileButton({ username, userAvatar, className = "w-50" }: ProfileButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const { setTheme } = useTheme();
    const navigate = useNavigate();

    function navPortal(location: string) {
        navigate(location);
    }

    async function handleSignOut() {
        await signOutCurrentUser();
        setTheme("default")
        navigate("/login", { replace: true });
    }

    return (
        <div className={"relative " + className}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="group relative flex w-full items-center cursor-pointer"
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
                        bg-linear-to-b 
                        from-contrast-start 
                        from-50 
                        via-contrast-middle 
                        to-contrast-end
                        to-70
                        outline-3
                        outline-contrast-middle
                        text-ink
                        group-hover:brightness-125
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
                        bg-linear-to-b 
                        from-contrast-start 
                        from-50 
                        via-contrast-middle 
                        to-contrast-end
                        to-70
                        outline-3
                        outline-contrast-middle
                        group-hover:brightness-125
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
                        w-12/15
                        flex
                        flex-col
                        bg-contrast-start
                        outline-3
                        outline-contrast-middle
                        overflow-hidden
                        rounded-b-lg
                        pb-1
                    "
                >
                    <button
                        className="group relative py-1 overflow-hidden cursor-pointer transition-all"
                        onClick={() => navPortal("/profile")}
                    >
                        <span
                            className="
                            absolute inset-0
                            bg-linear-to-b
                            from-contrast-start from-50
                            via-contrast-middle
                            to-contrast-end to-70
                            brightness-85
                            group-hover:brightness-125
                            transition-[filter]
                            "
                        />
                        <span className="relative text-ink group-hover:brightness-125">
                            My Profile
                        </span>
                    </button>
                    <div className="mx-1 border-t-4 border-contrast-middle"></div>
                    <button
                        className="group relative py-1 overflow-hidden cursor-pointer transition-all"
                        onClick={() => navPortal("/friends/my_friends")}
                    >
                        <span
                            className="
                            absolute inset-0
                            bg-linear-to-b
                            from-contrast-start from-50
                            via-contrast-middle
                            to-contrast-end to-70
                            brightness-85
                            group-hover:brightness-125
                            transition-[filter]
                            "
                        />
                        <span className="relative text-ink group-hover:brightness-125">
                            My Friends
                        </span>
                    </button>
                    <div className="mx-1 border-t-4 border-contrast-middle"></div>
                    <button
                        className="group relative py-1 overflow-hidden cursor-pointer transition-all"
                        onClick={() => navPortal("/friends/my_communities")}
                    >
                        <span
                            className="
                            absolute inset-0
                            bg-linear-to-b
                            from-contrast-start from-50
                            via-contrast-middle
                            to-contrast-end to-70
                            brightness-85
                            group-hover:brightness-125
                            transition-[filter]
                            "
                        />
                        <span className="relative text-ink group-hover:brightness-125">
                            My Communities
                        </span>
                    </button>
                    <div className="mx-1 border-t-4 border-contrast-middle"></div>
                    <button
                        className="group relative py-1 overflow-hidden cursor-pointer transition-all"
                        onClick={handleSignOut}
                    >
                        <span
                            className="
                            absolute inset-0
                            bg-linear-to-b
                            from-contrast-start from-50
                            via-contrast-middle
                            to-contrast-end to-70
                            brightness-85
                            group-hover:brightness-125
                            transition-[filter]
                            "
                        />
                        <span className="relative text-ink group-hover:brightness-125">
                            Sign Out
                        </span>
                    </button>
                </div>
            )}
        </div>
    );
}
