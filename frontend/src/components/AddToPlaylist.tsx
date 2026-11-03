import { useState, type FormEvent } from "react"

import { ApiError } from "@/lib/api"
import { addToPlaylist, createPlaylist, fetchMyPlaylists, type Playlist } from "@/lib/playlists"

const controlClass =
    "rounded-lg border-2 border-accent-start bg-white px-3 py-1 text-sm font-semibold text-black hover:brightness-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"

type AddToPlaylistProps = {
    scenarioId: string
}

/**
 * User story #36: add the previewed scenario to one of the caller's playlists, or to a new one.
 * Render it with key={scenarioId} so switching scenarios closes it.
 */
export function AddToPlaylist({ scenarioId }: AddToPlaylistProps) {
    const [open, setOpen] = useState(false)
    const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [newName, setNewName] = useState("")

    async function toggle() {
        if (open) {
            setOpen(false)
            return
        }
        setOpen(true)
        setMessage(null)
        try {
            setPlaylists(await fetchMyPlaylists())
        } catch (err) {
            console.error(err)
            setMessage("Couldn't load your playlists.")
        }
    }

    async function add(playlist: Playlist) {
        setBusy(true)
        setMessage(null)
        try {
            const updated = await addToPlaylist(playlist.id, scenarioId)
            setPlaylists((current) =>
                (current ?? []).map((p) => (p.id === playlist.id ? { ...p, scenarioIds: updated.scenarioIds } : p)),
            )
            setMessage(`Added to ${playlist.name}.`)
        } catch (err) {
            console.error(err)
            setMessage(err instanceof ApiError && err.status === 409 ? err.message : "Couldn't add it.")
        } finally {
            setBusy(false)
        }
    }

    async function createAndAdd(event: FormEvent) {
        event.preventDefault()
        const name = newName.trim()
        if (!name) return
        setBusy(true)
        setMessage(null)
        try {
            const created = await createPlaylist(name)
            const updated = await addToPlaylist(created.id, scenarioId)
            setPlaylists((current) => [...(current ?? []), { ...created, scenarioIds: updated.scenarioIds }])
            setNewName("")
            setMessage(`Added to ${created.name}.`)
        } catch (err) {
            console.error(err)
            setMessage(err instanceof ApiError && err.status === 422 ? "That name won't work." : "Couldn't create it.")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="mt-4">
            <button type="button" aria-expanded={open} onClick={() => void toggle()} className={controlClass}>
                + Add to playlist
            </button>

            {open && (
                <div className="mt-2 flex flex-col gap-2 rounded-lg border-2 border-accent-start p-3 text-sm text-ink">
                    {playlists === null && !message ? (
                        <p className="text-muted">Loading your playlists…</p>
                    ) : playlists !== null && (
                        playlists.length === 0 ? (
                            <p className="text-muted">You don't have any playlists yet.</p>
                        ) : (
                            <ul aria-label="Your playlists" className="flex flex-wrap gap-2">
                                {playlists.map((playlist) => {
                                    const added = playlist.scenarioIds.includes(scenarioId)
                                    return (
                                        <li key={playlist.id}>
                                            <button
                                                type="button"
                                                disabled={busy || added}
                                                onClick={() => void add(playlist)}
                                                className={controlClass}
                                            >
                                                {added ? `✓ ${playlist.name}` : playlist.name}
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        )
                    )}

                    <form onSubmit={(e) => void createAndAdd(e)} className="flex gap-2">
                        <input
                            aria-label="New playlist name"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            maxLength={60}
                            placeholder="New playlist"
                            className="min-w-0 flex-1 rounded-lg border-2 border-accent-start bg-white px-2 py-1 text-black"
                        />
                        <button type="submit" disabled={busy || !newName.trim()} className={controlClass}>
                            Create &amp; add
                        </button>
                    </form>

                    {message && <p role="status">{message}</p>}
                </div>
            )}
        </div>
    )
}
