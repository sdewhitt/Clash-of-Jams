import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { searchNonCommunityUsers, searchPublicUsers } from "@/lib/profile/userProfileSearch";
import type { CommunityMembership, SearchProfile } from "@/lib/schema/types";
import { sendCommunityRequest } from "@/lib/communities/communityRequests";
import UserSearchResult from "./UserSearchResult";

type CreateCommunityCardProps = {
    communityId: string;
    searcherUid: string;
    members: CommunityMembership[];
    onClose: () => void;
}

export function CommunityInviteCard(props: CreateCommunityCardProps) {
    const [ searchTerm, setSearchTerm ] = useState("");
    const [ results, setResults ] = useState<SearchProfile[]>([]);
    const [ loading, setLoading ] = useState(false);
    const [ searchError, setSearchError ] = useState<string | null>(null);

    const [instrumentFilter, setInstrumentFilter] = useState("all");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const communityMemberIds: string[] = props.members.map(
        (member) => member.uid
    );

    useEffect(() => {
        const term = searchTerm.trim();

        let override = false;
        if (term.length == 0) {
            override = true;
        }
        else if (term.length < 3) {
            setLoading(false);
            setSearchError(null);
            return;
        }

        let cancelled = false;

        const timer = window.setTimeout(async () => {
            if (!props.searcherUid) {
                return;
            }

            setLoading(true);
            setSearchError(null);

            try {
                const users = await searchNonCommunityUsers(props.searcherUid, term, override, communityMemberIds, instrumentFilter);

                if (!cancelled) {
                    setResults( users );
                }
            } catch (err) {
                console.error("Failed to search users:", err);

                if (!cancelled) {
                    setSearchError("Unable to search users. Please try again.");
                    setResults([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }, 300);

        return () => {
        cancelled = true;
        override = false;
        window.clearTimeout(timer);
        };
    }, [searchTerm, props.searcherUid]);

    async function modifySearchParameters(instrument: string) {
        setInstrumentFilter(instrument);

        setLoading(true);
        setError(null);

        const term = searchTerm.trim();

        let override = false;
        if (term.length == 0) {
            override = true;
        }
        else if (term.length < 3) {
            setLoading(false);
            setError(null);
            return;
        }

        let cancelled = false;

        try {
            const users = await searchPublicUsers(props.searcherUid, term, override, instrument);

            if (!cancelled) {
                setResults( users );
            }
        } catch (err) {
            console.error("Failed to search users:", err);

            if (!cancelled) {
                setError("Unable to search users. Please try again.");
                setResults([]);
            }
        } finally {
            if (!cancelled) {
                setLoading(false);
            }
        }
    }

    async function handleInvite(invitedUid: string) {
        if (submitting) return;

        try {
            setSubmitting(true);
            setError(null);

            await sendCommunityRequest(props.communityId, props.searcherUid, props.searcherUid, invitedUid);
        } catch (err) {
            console.error("Failed to create community:",  err );

            setError(err instanceof Error ? err.message : "Unable to create community.");
        } finally {
            setSubmitting(false);
        }
    }

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && !submitting) {
                    props.onClose();
                }
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="community-invitation-header"
                className={`
                    flex flex-col
                    w-full max-w-2xl
                    max-h-[85vh]
                    overflow-y-auto
                    rounded-2xl
                    bg-radial
                    from-contrast-start
                    via-contrast-middle 
                    to-contrast-end
                    border-2 border-accent-start
                    bg-surface
                    p-6
                    shadow-2xl
                `}
            >
                <header className="mb-5 flex items-center justify-between border-b-2">
                    <h2
                        id="community-invitation-header"
                        className="text-2xl font-bold text-ink"
                    >
                        Invite Members to the Community
                    </h2>

                    <button
                        type="button"
                        onClick={props.onClose}
                        disabled={submitting}
                        aria-label="Close Community Creation"
                        className="text-xl text-muted hover:text-ink disabled:opacity-50"
                    >
                        ✕
                    </button>
                </header>
                <div className="flex flex-1 min-h-0 flex-col gap-2">
                    <div className={`
                        shrink-0
                        relative
                        rounded-lg
                        bg-linear-to-b
                        from-accent-start
                        via-accent-middle
                        to-accent-end
                        border-4
                        border-accent-start
                        p-4
                    `}>
                        <label
                            htmlFor="user-search"
                            className="mb-2 block text-lg font-medium text-ink"
                        >
                            Search For Users:
                        </label>
                        <div
                            className="flex flex-row"
                        >
                            <input
                                id="user-search"
                                type="search"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Enter at least 3 characters..."
                                autoComplete="off"
                                className={`
                                    w-2/3
                                    px-2
                                    rounded-lg
                                    bg-contrast-middle 
                                    text-inverse-ink
                                    outline-2 
                                    outline-contrast-start 
                                    focus:outline-none 
                                    focus:ring-3 
                                    focus:ring-accent-end 
                                    transition-all`
                                }
                            />
                            <select
                                id="preferredInstrument"
                                name="instrument"
                                value={instrumentFilter}
                                onChange={(e) => modifySearchParameters(e.target.value)}
                                required
                                className={`
                                    m-4
                                    px-2 py-4
                                    w-1/3
                                    rounded-lg
                                    bg-contrast-middle
                                    text-inverse-ink
                                    outline-2
                                    outline-contrast-start
                                    focus:outline-none
                                    focus:ring-3
                                    focus:ring-accent-end
                                    transition-all
                                `}
                            >
                                <option className="text-md text-black" value="all">All Instruments</option>
                                <option className="text-md text-black" value="piano">Piano</option>
                                <option className="text-md text-black" value="guitar">Guitar</option>
                                <option className="text-md text-black" value="woodwind">Woodwind</option>
                                <option className="text-md text-black" value="vocals">Vocals</option>
                                <option className="text-md text-black" value="midi">Midi</option>
                            </select>
                        </div>
                    </div>

                    {searchTerm.trim().length != 0 && searchTerm.trim().length < 3 && (
                        <div className={`
                            flex items-center justify-center
                            rounded-lg
                            py-4
                            bg-linear-to-b
                            from-accent-start
                            via-accent-middle
                            to-accent-end
                        `}>
                            <p className="text-center text-md text-inverse-ink">
                                Type at least 3 characters to search.
                            </p>
                        </div>
                    )}
    
                    {loading && (
                        <div className={`
                            flex items-center justify-center
                            rounded-lg
                            py-4
                            bg-linear-to-b
                            from-accent-start
                            via-accent-middle
                            to-accent-end
                        `}>
                            <p className="text-center text-md text-inverse-ink">
                                Searching players...
                            </p>
                        </div>
                    )}
    
                    {searchError && (
                        <div className={`
                            flex items-center justify-center
                            rounded-lg
                            py-4
                            bg-linear-to-b
                            from-accent-start
                            via-accent-middle
                            to-accent-end
                        `}>
                            <p className="text-center text-md text-inverse-ink">
                                {searchError}
                            </p>
                        </div>
                    )}
    
                    {!loading && !searchError && (searchTerm.trim().length >= 3 || searchTerm.trim().length == 0) && results.length === 0 && (
                        <div className={`
                            flex items-center justify-center
                            rounded-lg
                            py-4
                            bg-linear-to-b
                            from-accent-start
                            via-accent-middle
                            to-accent-end
                        `}>
                            <p className="text-center text-md text-inverse-ink">
                                No users found. Try another username.
                            </p>
                        </div>
                    )}
    
                    <div className={`
                        flex-1 
                        min-h-0
                        overflow-y-auto
                        overscroll-contain
                    `}>
                        {!loading && (
                            <div className="py-4">
                                {results.length > 0 && (
                                    <div className="space-y-2 p-4">
                                        {results.map((profile) => (
                                            <UserSearchResult
                                                key={profile.uid}
                                                profile={profile}
                                                communitySearch={true}
                                                communityFunction={() => handleInvite(profile.uid)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {error && (
                    <p role="alert" className="mt-4 text-sm font-bold text-center text-ink">
                        {error}
                    </p>
                )}
            </section>
        </div>,
        document.body
    );
}