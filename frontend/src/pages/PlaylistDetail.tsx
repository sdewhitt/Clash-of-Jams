/**
 * User story #36: one playlist. Its owner can rename, share, delete, reorder and remove;
 * anyone it is shared with can see it and play from it.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'

import { BackButton } from '@/components/BackButton'
import { ProfileButton } from '@/components/ProfileButton'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth/useAuth'
import {
  deletePlaylist,
  fetchPlaylist,
  playlistUrl,
  removeFromPlaylist,
  reorderPlaylist,
  updatePlaylist,
  type PlaylistDetail as Detail,
} from '@/lib/playlists'

const buttonClass =
  'cursor-pointer rounded-lg border-2 border-accent-start px-4 py-2 font-bold active:scale-95 disabled:cursor-not-allowed disabled:opacity-50'

const smallButtonClass =
  'cursor-pointer rounded-md border-2 border-accent-start px-2 py-1 text-sm font-semibold hover:bg-accent-start disabled:cursor-not-allowed disabled:opacity-40'

const inputClass = 'rounded-lg border-2 border-accent-start bg-white px-3 py-2 text-black'

// Mirrors PlaylistName in backend/app/schemas.py.
const MAX_NAME_LENGTH = 60

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status !== 0 && err.status < 500 ? err.message : fallback
}

export function PlaylistDetail() {
  const { playlistId = '' } = useParams()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [playlist, setPlaylist] = useState<Detail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPlaylist(playlistId)
      .then((loaded) => {
        if (!cancelled) setPlaylist(loaded)
      })
      .catch((err) => {
        console.error(err)
        if (cancelled) return
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? 'This playlist doesn’t exist, or it isn’t shared with you.'
            : "Couldn't load this playlist.",
        )
      })
    return () => {
      cancelled = true
    }
  }, [playlistId])

  /** Runs one change against the API, keeping the page on the playlist it returns. */
  async function save(change: () => Promise<Partial<Detail>>, fallback: string) {
    setSaving(true)
    setActionError(null)
    try {
      const updated = await change()
      setPlaylist((current) => (current ? { ...current, ...updated } : current))
    } catch (err) {
      console.error(err)
      setActionError(errorMessage(err, fallback))
    } finally {
      setSaving(false)
    }
  }

  const isOwner = playlist !== null && playlist.ownerUid === user?.uid

  function move(index: number, by: -1 | 1) {
    if (!playlist) return
    const order = playlist.entries.map((entry) => entry.scenarioId)
    ;[order[index], order[index + by]] = [order[index + by], order[index]]
    void save(() => reorderPlaylist(playlist.id, order), "Couldn't reorder the playlist.")
  }

  return (
    <main className="min-h-screen text-ink">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-accent-start bg-linear-to-r from-accent-base-start via-accent-base-middle to-accent-base-end px-6 py-6">
        <div className="flex min-w-0 items-center gap-4">
          <BackButton onClick={() => navigate('/playlists')} />
          <h1 className="truncate text-3xl font-bold">{playlist?.name ?? 'Playlist'}</h1>
        </div>
        <ProfileButton
          username={profile?.displayName ?? user?.email ?? '…'}
          userAvatar={profile?.avatarUrl ?? '/favicon.svg'}
        />
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
        {loadError ? (
          <p role="alert">{loadError}</p>
        ) : playlist === null ? (
          <p>Loading the playlist…</p>
        ) : (
          <>
            {isOwner ? (
              <OwnerControls
                // Fresh state after a rename, so the field shows the saved name.
                key={playlist.name}
                playlist={playlist}
                saving={saving}
                onRename={(name) =>
                  void save(() => updatePlaylist(playlist.id, { name }), "Couldn't rename it.")
                }
                onShare={(isPublic) =>
                  void save(
                    () => updatePlaylist(playlist.id, { isPublic }),
                    "Couldn't change sharing.",
                  )
                }
                onDelete={() =>
                  void save(async () => {
                    await deletePlaylist(playlist.id)
                    navigate('/playlists')
                    return {}
                  }, "Couldn't delete it.")
                }
              />
            ) : (
              <p className="text-sm text-muted">Shared with you. Only its owner can change it.</p>
            )}

            {actionError && <p role="alert">{actionError}</p>}

            {playlist.entries.length === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-accent-start p-5 text-muted">
                No scenarios in this playlist yet
                {isOwner && '. Add one from a scenario’s preview on the Solo Play page.'}
              </p>
            ) : (
              <ol aria-label="Scenarios" className="flex flex-col gap-3">
                {playlist.entries.map((entry, index) => {
                  const title = entry.title ?? 'Unavailable scenario'
                  return (
                    <li
                      key={entry.scenarioId}
                      className="flex flex-wrap items-center gap-3 rounded-xl border-3 border-accent-start bg-linear-to-r from-accent-base-start via-accent-base-middle to-accent-base-end px-5 py-3"
                    >
                      <span className="w-6 text-right text-sm text-muted tabular-nums">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-xl font-bold ${entry.available ? '' : 'text-muted'}`}
                        >
                          {title}
                        </p>
                        {!entry.available && (
                          <p className="text-xs text-muted">
                            This scenario was deleted or made private
                          </p>
                        )}
                      </div>

                      {isOwner && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            aria-label={`Move ${title} up`}
                            disabled={saving || index === 0}
                            onClick={() => move(index, -1)}
                            className={smallButtonClass}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${title} down`}
                            disabled={saving || index === playlist.entries.length - 1}
                            onClick={() => move(index, 1)}
                            className={smallButtonClass}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${title}`}
                            disabled={saving}
                            onClick={() =>
                              void save(
                                () => removeFromPlaylist(playlist.id, entry.scenarioId),
                                "Couldn't remove it.",
                              )
                            }
                            className={smallButtonClass}
                          >
                            Remove
                          </button>
                        </div>
                      )}

                      {entry.available && (
                        <button
                          type="button"
                          aria-label={`Play ${title}`}
                          onClick={() => navigate(`/play/${entry.scenarioId}`)}
                          className={`${buttonClass} bg-accent-start`}
                        >
                          Play
                        </button>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function OwnerControls({
  playlist,
  saving,
  onRename,
  onShare,
  onDelete,
}: {
  playlist: Detail
  saving: boolean
  onRename: (name: string) => void
  onShare: (isPublic: boolean) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(playlist.name)
  const [nameError, setNameError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [copied, setCopied] = useState(false)

  function rename(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('A playlist needs a name.')
      return
    }
    setNameError(null)
    if (trimmed !== playlist.name) onRename(trimmed)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(playlistUrl(playlist.id))
      setCopied(true)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <section aria-label="Playlist settings" className="flex flex-col gap-4">
      <form onSubmit={rename} className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-sm font-semibold">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME_LENGTH}
            className={inputClass}
          />
        </label>
        <button type="submit" disabled={saving} className={buttonClass}>
          Rename
        </button>
        {nameError && (
          <p role="alert" className="w-full text-sm">
            {nameError}
          </p>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={playlist.isPublic}
            disabled={saving}
            onChange={(e) => onShare(e.target.checked)}
            className="size-4"
          />
          Share with anyone who has the link
        </label>
        {playlist.isPublic && (
          <button type="button" onClick={() => void copyLink()} className={smallButtonClass}>
            {copied ? 'Link copied' : 'Copy link'}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {confirmingDelete ? (
            <>
              <span className="text-sm">Delete this playlist?</span>
              <button
                type="button"
                disabled={saving}
                onClick={onDelete}
                className={`${smallButtonClass} bg-accent-start`}
              >
                Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className={smallButtonClass}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className={smallButtonClass}
            >
              Delete playlist
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
