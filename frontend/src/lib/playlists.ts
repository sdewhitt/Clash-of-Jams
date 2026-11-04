/**
 * Playlists of scenarios (user story #36).
 *
 * Every write goes through the backend: firestore.rules don't let the client write playlists,
 * so the API is what checks names, ownership and duplicates.
 */
import { apiFetch } from '@/lib/api'

/** Mirrors backend/app/schemas.py's Playlist; timestamps arrive as ISO strings. */
export interface Playlist {
  id: string
  ownerUid: string
  name: string
  description: string
  /** Shared: anyone with the link can open it, only the owner can change it. */
  isPublic: boolean
  /** Play order. */
  scenarioIds: string[]
  createdAt: string
  updatedAt: string
}

export interface PlaylistEntry {
  scenarioId: string
  /** null once the scenario has been deleted or made private. */
  title: string | null
  available: boolean
}

export interface PlaylistDetail extends Playlist {
  entries: PlaylistEntry[]
}

export type PlaylistChanges = Partial<Pick<Playlist, 'name' | 'description' | 'isPublic'>>

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
})

/** The caller's own playlists. */
export function fetchMyPlaylists(): Promise<Playlist[]> {
  return apiFetch<Playlist[]>('/playlists')
}

/** One playlist with its scenarios looked up: the caller's own, or a shared one. */
export function fetchPlaylist(playlistId: string): Promise<PlaylistDetail> {
  return apiFetch<PlaylistDetail>(`/playlists/${encodeURIComponent(playlistId)}`)
}

export function createPlaylist(name: string, isPublic = false): Promise<Playlist> {
  return apiFetch<Playlist>('/playlists', json('POST', { name, isPublic }))
}

/** Rename, re-describe, or share/unshare. Only the fields given change. */
export function updatePlaylist(playlistId: string, changes: PlaylistChanges): Promise<Playlist> {
  return apiFetch<Playlist>(`/playlists/${encodeURIComponent(playlistId)}`, json('PATCH', changes))
}

export function deletePlaylist(playlistId: string): Promise<void> {
  return apiFetch<void>(`/playlists/${encodeURIComponent(playlistId)}`, { method: 'DELETE' })
}

/** Appends to the end. A scenario already in the playlist is a 409. */
export function addToPlaylist(playlistId: string, scenarioId: string): Promise<PlaylistDetail> {
  return apiFetch<PlaylistDetail>(
    `/playlists/${encodeURIComponent(playlistId)}/scenarios`,
    json('POST', { scenarioId }),
  )
}

export function removeFromPlaylist(
  playlistId: string,
  scenarioId: string,
): Promise<PlaylistDetail> {
  return apiFetch<PlaylistDetail>(
    `/playlists/${encodeURIComponent(playlistId)}/scenarios/${encodeURIComponent(scenarioId)}`,
    { method: 'DELETE' },
  )
}

/** `scenarioIds` must be the playlist's scenarios, rearranged. */
export function reorderPlaylist(playlistId: string, scenarioIds: string[]): Promise<PlaylistDetail> {
  return apiFetch<PlaylistDetail>(
    `/playlists/${encodeURIComponent(playlistId)}/scenarios`,
    json('PUT', { scenarioIds }),
  )
}

/** The link that opens a shared playlist. */
export function playlistUrl(playlistId: string): string {
  return `${window.location.origin}/playlists/${encodeURIComponent(playlistId)}`
}
