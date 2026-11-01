import { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications } from "@/lib/notifications/useNotifications";
import { NotificationDropdown } from "@/components/NotificationDropdown";

interface NotificationButtonProps {
  uid: string;
}

export function NotificationButton({ uid }: NotificationButtonProps) {
    const [isOpen, setIsOpen] = useState(false);
    const { notifications, unreadCount, loading, error, } = useNotifications(uid);

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen((prev) => !prev)}
                className="
                    relative
                    flex
                    items-center
                    justify-center
                    rounded-full
                    p-3
                    text-ink
                    hover:bg-surface/50
                    transition
                "
                aria-label="Notifications"
                aria-expanded={isOpen}
            >
                <Bell size={24} />

                {unreadCount > 0 && (
                    <span className="
                    absolute
                    -right-1
                    -top-1
                    flex
                    h-5
                    min-w-5
                    items-center
                    justify-center
                    rounded-full
                    bg-red-500
                    px-1
                    text-xs
                    font-bold
                    text-white
                    ">
                    {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <NotificationDropdown
                    uid={uid}
                    notifications={notifications}
                    loading={loading}
                    error={error}
                    onClose={() => setIsOpen(false)}
                />
            )}
        </div>
    );
}