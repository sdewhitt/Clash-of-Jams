import { useState } from "react";
import { processAvatar } from "@/lib/profile/UserProfile";

type AvatarUploadProps = {
    currentAvatarUrl: string;
    onAvatarUpdated: (url: string) => void;
};

export function AvatarUploader({ currentAvatarUrl, onAvatarUpdated, }: AvatarUploadProps) {
    const [uploading, setUploading] = useState(false);
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

            const newAvatarUrl = await processAvatar(file);
            onAvatarUpdated(newAvatarUrl);

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

    return (
        <div className="relative h-24 w-24">
            <label
                htmlFor="avatar-upload"
                className="block h-24 w-24 cursor-pointer overflow-hidden rounded-full outline-3 outline-contrast-start transition duration-200 hover:scale-105 hover:brightness-125 active:scale-95"
            >
                <img
                    src={currentAvatarUrl}
                    alt="Profile avatar"
                    className="h-full w-full rounded-full object-cover bg-contrast-end"
                />

                <input
                    id="avatar-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleUpload}
                    disabled={uploading}
                    className="hidden"
                />
            </label>

            {error && (
                <p className="mt-2 text-red-400">
                    {error}
                </p>
            )}
        </div>
    );
}