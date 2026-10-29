type UsernameEditorProps = {
    username: string;
    onUsernameDraftChanged: (username: string) => void;
};

export function UsernameEditor({ username, onUsernameDraftChanged, }: UsernameEditorProps) {
    return (
        <div className="flex flex-col gap-2">
            <p className="text-md font-medium text-accent-start select-none">
                Username:
            </p>

            <input
                id="usernameInput"
                type="text"
                value={username}
                onChange={(event) =>
                    onUsernameDraftChanged(event.target.value)
                }
                className="
                    mt-2
                    w-full
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
                placeholder="Enter your username"
            />
        </div>
    );
}