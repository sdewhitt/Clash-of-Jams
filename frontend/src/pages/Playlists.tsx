/**
 * User story #36: the signed-in user's playlists, and creating a new one.
 * A playlist opens on its own page, where it is renamed, shared, reordered and played.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { BackButton } from '@/components/BackButton'
import { ProfileButton } from '@/components/ProfileButton'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth/useAuth'
import { createPlaylist, fetchMyPlaylists, type Playlist } from '@/lib/playlists'

const buttonClass =
  'cursor-pointer rounded-lg border-2 border-accent-start px-4 py-2 font-bold active:scale-95 disabled:cursor-not-allowed disabled:opacity-50'

const inputClass = 'rounded-lg border-2 border-accent-start bg-white px-3 py-2 text-black'

// Mirrors PlaylistName in backend/app/schemas.py.
const MAX_NAME_LENGTH = 60

export function Playlists() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchMyPlaylists()
      .then((mine) => {
        if (!cancelled) setPlaylists(mine)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError("Couldn't load your playlists.")
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setCreateError('Give your playlist a name.')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const playlist = await createPlaylist(trimmed)
      navigate(`/playlists/${playlist.id}`)
    } catch (err) {
      console.error(err)
      setCreateError(err instanceof ApiError ? err.message : "Couldn't create the playlist.")
      setCreating(false)
    }
  }

  return (
    <main className="min-h-screen text-ink">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-accent-start bg-linear-to-r from-accent-base-start via-accent-base-middle to-accent-base-end px-6 py-6">
        <div className="flex items-center gap-4">
          <BackButton onClick={() => navigate('/home')} />
          <h1 className="text-3xl font-bold">Playlists</h1>
        </div>
        <ProfileButton
          username={profile?.displayName ?? user?.email ?? '…'}
          userAvatar={profile?.avatarUrl ?? '/favicon.svg'}
        />
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
        <form onSubmit={(e) => void create(e)} className="flex flex-wrap items-start gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-sm font-semibold">New playlist</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME_LENGTH}
              placeholder="e.g. Warmups"
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className={`${buttonClass} mt-6 bg-accent-start`}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
          {createError && (
            <p role="alert" className="w-full text-sm">
              {createError}
            </p>
          )}
        </form>

        {loadError ? (
          <p role="alert">{loadError}</p>
        ) : playlists === null ? (
          <p>Loading your playlists…</p>
        ) : playlists.length === 0 ? (
          <p className="text-muted">You don&apos;t have any playlists yet. Create one above.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/playlists/${playlist.id}`)}
                  className="flex w-full cursor-pointer items-center gap-4 rounded-xl border-3 border-accent-start bg-linear-to-r from-accent-base-start via-accent-base-middle to-accent-base-end px-5 py-3 text-left hover:brightness-105"
                >
                  <span className="min-w-0 flex-1 truncate text-xl font-bold">{playlist.name}</span>
                  {playlist.isPublic && <span className="text-xs text-muted">Shared</span>}
                  <span className="text-sm text-muted">
                    {playlist.scenarioIds.length}{' '}
                    {playlist.scenarioIds.length === 1 ? 'scenario' : 'scenarios'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
