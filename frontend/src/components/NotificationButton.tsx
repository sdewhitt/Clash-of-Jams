import { Bell } from "lucide-react";
import { useNotifications } from "@/lib/notifications/useNotifications";
import { useNavigate } from "react-router";

interface NotificationButtonProps {
  uid: string;
}

export function NotificationButton({ uid }: NotificationButtonProps) {
    const navigate = useNavigate()
    const { unreadCount } = useNotifications(uid);

    return (
        <div className="relative">
            <button
                onClick={() => navigate('/notifications')}
                className="
                    relative
                    group
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
            >
                <Bell size={36} className="notification-bell" aria-hidden="true"/>

                {unreadCount > 0 && (
                    <>
                        <span
                            className="
                                absolute
                                -right-1
                                top-8
                                flex
                                h-5
                                min-w-5
                                items-center
                                justify-center
                                rounded-full
                                bg-contrast-middle
                                px-1
                                animate-ping
                            "
                        />
                        <span className="
                            absolute
                            -right-1
                            top-8
                            flex
                            h-5
                            min-w-5
                            items-center
                            justify-center
                            rounded-full
                            bg-contrast-middle
                            px-1
                            text-xs
                            font-bold
                            text-white
                        ">
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    </>
                )}
            </button>
        </div>
    );
}