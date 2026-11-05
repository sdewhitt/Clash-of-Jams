import { useState } from "react";
import { createPortal } from "react-dom";
import { createCommunityNotification } from "@/lib/communities/communityNotifications";

type CreateCommunityAnnouncementProps = {
    communityId: string;
    announcerUid: string;
    onClose: () => void;
}

export function CreateCommunityAnnouncement(props: CreateCommunityAnnouncementProps) {
    const [announcementTitle, setAnnouncementTitle] = useState<string | null>(null);
    const [announcement, setAnnouncement] = useState<string | null>(null);
    const [announcementForAll, setAnnouncementForAll] = useState(true);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSubmit() {
        if (submitting) return;

        try {
            setSubmitting(true);
            setError(null);

            if (!announcementTitle || announcementTitle.trim().length == 0) {
                throw new Error("Announcement title cannot be empty. Please enter title for the announcement.");
            }
            if (!announcement || announcement.trim().length == 0) {
                throw new Error("Announcement body cannot be empty. Please enter announcement body.");
            }

            if (announcementForAll) {
                await createCommunityNotification(props.communityId, props.announcerUid, announcementTitle, announcement, ['owner', 'moderator', 'member']);
            }
            else {
                await createCommunityNotification(props.communityId, props.announcerUid, announcementTitle, announcement, ['owner', 'moderator']);
            }

            props.onClose();
        } catch (err) {
            console.error("Failed to create community announcement:",  err );

            setError(err instanceof Error ? err.message : "Unable to create community announcement.");
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
                aria-labelledby="community-announcement-creation-header"
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
                        id="community-announcement-creation-header"
                        className="text-2xl font-bold text-ink"
                    >
                        Create Community Announcement
                    </h2>

                    <button
                        type="button"
                        onClick={props.onClose}
                        disabled={submitting}
                        aria-label="Close Community Announcement Creation"
                        className="text-xl text-muted hover:text-ink disabled:opacity-50"
                    >
                        ✕
                    </button>
                </header>

                <div className="flex flex-col items-center gap-4">
                    <div className="w-full flex flex-col gap-2">
                        <p className="text-md font-medium text-accent-start select-none">
                            Announcement Title:
                        </p>

                        <input
                            id="communityTitleInput"
                            type="text"
                            value={announcementTitle ?? ""}
                            onChange={(event) => setAnnouncementTitle(event.target.value)}
                            className="
                                rounded-lg
                                border
                                border-line
                                bg-linear-to-b
                                from-accent-start
                                via-accent-middle
                                to-accent-end
                                px-4
                                py-3
                                text-ink
                                outline-none
                                focus:border-accent-start
                            "
                            placeholder="Enter announcement's title..."
                        />
                    </div>

                    <div className="w-full flex flex-col gap-2">
                        <label
                            htmlFor="announcement"
                            className="text-md font-medium text-accent-start select-none"
                        >
                            Announcement:
                        </label>

                        <textarea
                            id="announcement"
                            value={announcement ?? ""}
                            onChange={(event) => setAnnouncement(event.target.value)}
                            className="
                                w-full
                                min-h-32
                                resize-y
                                rounded-lg
                                border
                                border-line
                                bg-linear-to-b
                                from-accent-start
                                via-accent-middle
                                to-accent-end
                                px-4
                                py-3
                                text-ink
                                outline-none
                                focus:border-accent-start
                            "
                            placeholder="Enter announcement information..."
                        />
                    </div>

                    <div className="w-full flex flex-col gap-2">
                        <label
                            htmlFor="announcementPublicity"
                            className="text-md font-medium text-accent-start select-none"
                        >
                            Announcement Recipients:
                        </label>

                        <button
                            id="announcementPublicity"
                            type="button"
                            onClick={() => setAnnouncementForAll(!announcementForAll)}
                            aria-pressed={announcementForAll}
                            className={`
                                w-full
                                rounded-lg
                                px-4 py-2
                                select-none
                                bg-linear-to-b
                                from-accent-start
                                via-accent-middle
                                to-accent-end
                                text-ink
                                transition
                                duration-200
                                border-2
                                hover:scale-101
                                active:scale-99
                                active:opacity-30%
                                active:brightness-60
                            `}
                        >
                            {announcementForAll ? "All Community Members" : "Only Owner and Moderators"}
                        </button>
                    </div>
                </div>

                {error && (
                    <p role="alert" className="mt-4 text-sm font-bold text-center text-ink">
                        {error}
                    </p>
                )}

                <footer className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={props.onClose}
                        disabled={submitting}
                        className="
                            rounded-lg
                            bg-radial
                            from-accent-start
                            via-accent-middle 
                            to-accent-end
                            px-5 py-2 font-semibold text-inverse-ink
                            border border-2 border-ink
                            hover:brightness-110
                            disabled:cursor-not-allowed
                            disabled:opacity-80
                        "
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={submitting}
                        className="
                            rounded-lg
                            bg-radial
                            from-accent-start
                            via-accent-middle 
                            to-accent-end
                            px-5 py-2 font-semibold text-inverse-ink
                            border border-2 border-ink
                            hover:brightness-110
                            disabled:cursor-not-allowed
                            disabled:opacity-80
                        "
                    >
                        {submitting ? "Creating..." : "Create Announcement"}
                    </button>
                </footer>
            </section>
        </div>,
        document.body
    );
}