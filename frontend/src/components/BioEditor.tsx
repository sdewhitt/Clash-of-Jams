type BioEditorProps = {
    bio: string;
    onBioDraftChanged: (bio: string) => void;
};

export function BioEditor({ bio, onBioDraftChanged }: BioEditorProps) {
    return (
        <div className="flex flex-col gap-2">
            <label
                htmlFor="bio"
                className="text-md font-medium text-accent-start select-none"
            >
                Bio:
            </label>

            <textarea
                id="bio"
                value={bio}
                onChange={(event) =>
                    onBioDraftChanged(event.target.value)
                }
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
                placeholder="Enter your bio"
            />
        </div>
    );
}