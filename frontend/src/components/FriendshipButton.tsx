import { useState } from 'react';
import { useFriendshipStatus, sendFriendRequest, acceptFriendRequest, declineFriendRequest } from '@/lib/friendship/friendRequests';
import { removeFriend } from '@/lib/friendship/friendManagement';

interface FriendRequestButtonProps {
    currentUid: string;
    profileUid: string;
}

const buttonStyles = {
    primary: `
        bg-linear-to-r 
        from-contrast-start
        via-contrast-middle 
        to-contrast-end
        hover:brightness-110
        text-ink
    `,
    success: `
        bg-linear-to-r from-emerald-600 to-green-500
        hover:from-emerald-500 hover:to-green-400
        text-white
    `,
    danger: `
        bg-linear-to-r from-red-700 to-rose-600
        hover:from-red-600 hover:to-rose-500
        text-white
    `,
    secondary: `
        bg-linear-to-r 
        from-contrast-start
        via-contrast-middle 
        to-contrast-end
        brightness-80
        border border-line
        hover:bg-line
        text-muted
    `,
};

const baseButtonStyle = `
    inline-flex items-center justify-center
    rounded-lg px-4 py-2.5
    text-md font-semibold
    shadow-md
    transition-all duration-200 ease-in-out
    hover:shadow-lg
    active:scale-95
    disabled:cursor-not-allowed
    disabled:opacity-50
    disabled:hover:scale-100
`;

export default function FriendRequestButton({ currentUid, profileUid, }: FriendRequestButtonProps) {

    const { friendStatus, loading } = useFriendshipStatus( currentUid, profileUid );

    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAction = async (action: () => Promise<void>) => {
        try {
            setProcessing(true);
            setError(null);

            await action();

        } catch (err) {
            console.error('Friendship action failed:', err);

            setError(
                err instanceof Error
                    ? err.message
                    : 'Something went wrong.'
            );

        } finally {
            setProcessing(false);
        }
    };

    if (!currentUid || currentUid === profileUid) {
        return null;
    }

    if (loading) {
        return (
            <button
                disabled
                className={`
                    ${baseButtonStyle}
                    ${buttonStyles.secondary}
                    animate-pulse
                `}
            >
                Loading...
            </button>
        );
    }

    const disabled = processing;

    const getButtonClass = (style: keyof typeof buttonStyles) => `
        ${baseButtonStyle}
        ${buttonStyles[style]}
        ${disabled ? '' : 'hover:-translate-y-0.5'}
    `;

    return (
        <div className="flex flex-row gap-2">

            {!friendStatus && (
                <button
                    disabled={disabled}
                    onClick={() =>
                        handleAction(() =>
                            sendFriendRequest(currentUid, profileUid)
                        )
                    }
                    className={getButtonClass('primary')}
                >
                    {processing ? 'Sending...' : '+ Add Friend'}
                </button>
            )}

            {friendStatus === 'sent_pending' && (
                <button
                    disabled={disabled}
                    onClick={() =>
                        handleAction(() =>
                            declineFriendRequest(currentUid, profileUid)
                        )
                    }
                    className={getButtonClass('secondary')}
                >
                    {processing ? 'Canceling...' : 'Cancel Request'}
                </button>
            )}

            {friendStatus === 'recieved_pending' && (
                <div className="flex gap-2">

                    <button
                        disabled={disabled}
                        onClick={() =>
                            handleAction(() =>
                                acceptFriendRequest(currentUid, profileUid)
                            )
                        }
                        className={`
                            ${getButtonClass('success')}
                            flex-1
                        `}
                    >
                        {processing ? 'Processing...' : 'Accept'}
                    </button>

                    <button
                        disabled={disabled}
                        onClick={() =>
                            handleAction(() =>
                                declineFriendRequest(currentUid, profileUid)
                            )
                        }
                        className={`
                            ${getButtonClass('danger')}
                            flex-1
                        `}
                    >
                        Decline
                    </button>

                </div>
            )}

            {friendStatus === 'accepted' && (
                <button
                    disabled={disabled}
                    onClick={() => {
                        if (
                            window.confirm(
                                'Are you sure you want to remove this friend?'
                            )
                        ) {
                            handleAction(() =>
                                removeFriend(currentUid, profileUid)
                            );
                        }
                    }}
                    className={getButtonClass('danger')}
                >
                    {processing ? 'Removing...' : 'Remove Friend'}
                </button>
            )}

            {error && (
                <p className={`
                    py-4 px-2
                    bg-linear-to-r
                    from-contrast-start
                    via-contrast-middle 
                    to-contrast-end
                    brightness-80
                    text-md text-ink
                    rounded-lg
                `}>
                    ERROR: {error}
                </p>
            )}

        </div>
    );
}