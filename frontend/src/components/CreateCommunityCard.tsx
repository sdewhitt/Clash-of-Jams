import { useState } from "react";
import { useNavigate } from "react-router";
import { createPortal } from "react-dom";
import { createCommunity } from "@/lib/communities/communityManagement";
import { processImage } from "@/lib/profile/userProfile";

type CreateCommunityCardProps = {
    ownerUid: string;
    onClose: () => void;
}

export function CreateCommunityCard(props: CreateCommunityCardProps) {
    const navigate = useNavigate();

    const [communityIcon, setCommunityIcon] = useState<string | null>(null);
    const [communityName, setCommunityName] = useState<string | null>(null);
    const [description, setDescription] = useState<string | null>(null);
    const [isPublic, setIsPublic] = useState(true);

    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleUpload( event: React.ChangeEvent<HTMLInputElement> ) {
        const file = event.target.files?.[0];
    
        if (!file) { 
            console.log('Debug: File Does Not Exist');
            return; 
        }    

        try {
            setUploading(true);
            setError(null);

            const newIconUrl = await processImage(file);
            setCommunityIcon(newIconUrl);

        } catch (error) {
            console.error(error);

            setError(
                error instanceof Error
                    ? error.message
                    : "Failed to upload avatar."
            );

        } finally {
            setUploading(false);
            event.target.value = "";
        }
    }

    async function handleSubmit() {
        if (submitting) return;

        try {
            setSubmitting(true);
            setError(null);

            const communityId = await createCommunity(communityIcon ?? "", communityName ?? "", description ?? "", props.ownerUid, isPublic);

            navigate(`/community/${encodeURIComponent(communityId)}`, { replace: true });
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
                aria-labelledby="community-creation-header"
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
                        id="community-creation-header"
                        className="text-2xl font-bold text-ink"
                    >
                        Create New Community
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

                <div className="flex flex-col items-center gap-4">
                    <div className="relative h-36 w-36">
                        <label
                            htmlFor="community-icon-upload"
                            className="block h-36 w-36 cursor-pointer overflow-hidden rounded-full outline-3 outline-contrast-start transition duration-200 hover:scale-105 hover:brightness-125 active:scale-95"
                        >
                            <img
                                src={communityIcon ? communityIcon : '/upload.png'}
                                alt="Community Icon"
                                className="h-full w-full rounded-full object-cover bg-contrast-end"
                            />

                            <input
                                id="community-icon-upload"
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                onChange={handleUpload}
                                disabled={uploading}
                                className="hidden"
                            />
                        </label>
                    </div>
                    <div className="w-full flex flex-col gap-2">
                        <p className="text-md font-medium text-accent-start select-none">
                            Community Name:
                        </p>

                        <input
                            id="communityNameInput"
                            type="text"
                            value={communityName ?? ""}
                            onChange={(event) => setCommunityName(event.target.value)}
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
                            placeholder="Enter community's name..."
                        />
                    </div>

                    <div className="w-full flex flex-col gap-2">
                        <label
                            htmlFor="communityDescription"
                            className="text-md font-medium text-accent-start select-none"
                        >
                            Community Description:
                        </label>

                        <textarea
                            id="communityDescription"
                            value={description ?? ""}
                            onChange={(event) => setDescription(event.target.value)}
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
                            placeholder="Enter community's description..."
                        />
                    </div>

                    <div className="w-full flex flex-col gap-2">
                        <label
                            htmlFor="communityPublicity"
                            className="text-md font-medium text-accent-start select-none"
                        >
                            Community Publicity:
                        </label>

                        <button
                            id="communityPublicity"
                            type="button"
                            onClick={() => setIsPublic(!isPublic)}
                            aria-pressed={isPublic}
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
                            {isPublic ? "Public" : "Private"}
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
                        {submitting ? "Creating..." : "Create Community"}
                    </button>
                </footer>
            </section>
        </div>,
        document.body
    );
}