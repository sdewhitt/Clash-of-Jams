import { useState } from 'react';
import type { Community } from '@/lib/schema/types';
import { acceptCommunityRequest, cancelCommunityRequest, declineCommunityRequest, sendCommunityRequest, useRequestStatus } from '@/lib/communities/communityRequests';

interface CommunityRequestButtonProps {
    community: Community;
    activeUid: string;
    outsiderUid: string;
}

const buttonStyles = {
    primary: `
        bg-linear-to-r 
        from-contrast-start
        via-contrast-middle 
        to-contrast-end
        border-2 border-ink
        hover:brightness-110
        text-ink
    `,
    success: `
        bg-linear-to-r from-emerald-600 to-green-500
        border-2 border-ink
        hover:from-emerald-500 hover:to-green-400
        text-white
    `,
    danger: `
        bg-linear-to-r from-red-700 to-rose-600
        border-2 border-ink
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

export default function CommunityRequestButton({ community, activeUid, outsiderUid }: CommunityRequestButtonProps) {
    const {communityStatus, requestType, loading, error: requestLoadError,} = useRequestStatus(community.id, outsiderUid, activeUid);
    const canCancel = communityStatus === 'sent_pending' && requestType === 'community_knock_request' && activeUid === outsiderUid;

    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAction = async (action: () => Promise<void>) => {
        try {
            setProcessing(true);
            setError(null);

            await action();

        } catch (err) {
            console.error('Community action failed:', err);

            setError(
                err instanceof Error
                    ? err.message
                    : 'Something went wrong.'
            );

        } finally {
            setProcessing(false);
        }
    };

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

    if (requestLoadError) {
        return (
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

            {((!communityStatus || communityStatus === 'declined') && outsiderUid === activeUid) && (
                <button
                    disabled={disabled}
                    onClick={() =>
                        handleAction(() =>
                            sendCommunityRequest(community.id, activeUid, null, activeUid)
                        )
                    }
                    className={getButtonClass('primary')}
                >
                    {processing ? 'Requesting...' : 'Request to Join'}
                </button>
            )}

            {canCancel && (
                <button
                    disabled={disabled}
                    onClick={() =>
                        handleAction(() =>
                            cancelCommunityRequest(community.id, activeUid)
                        )
                    }
                    className={getButtonClass('secondary')}
                >
                    {processing ? 'Canceling...' : 'Cancel Request'}
                </button>
            )}

            {communityStatus === 'recieved_pending' && (
                <div className="flex gap-2">

                    <button
                        disabled={disabled}
                        onClick={() =>
                            handleAction(() =>
                                acceptCommunityRequest(community.id, activeUid, null, outsiderUid)
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
                                declineCommunityRequest(community.id, activeUid, null, outsiderUid)
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