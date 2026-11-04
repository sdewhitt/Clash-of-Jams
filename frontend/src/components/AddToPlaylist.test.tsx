/**
 * User story #36: adding the previewed scenario to a playlist.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AddToPlaylist } from '@/components/AddToPlaylist'
import type { Playlist } from '@/lib/playlists'
import { stubApi } from '@/test/api'
import { renderWithAuth, signedIn } from '@/test/render'

function playlist(id: string, scenarioIds: string[] = []): Playlist {
  return {
    id,
    ownerUid: 'user-1',
    name: id.toUpperCase(),
    description: '',
    isPublic: false,
    scenarioIds,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  }
}

function renderAdd(routes: Record<string, { status?: number; body: unknown }>) {
  const fetchMock = stubApi(routes)
  renderWithAuth(<AddToPlaylist scenarioId="scn" />, { auth: signedIn() })
  return fetchMock
}

function posts(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([input, init]) => [
      new URL(String(input), window.location.href).pathname.replace(/^\/api\/v1/, ''),
      JSON.parse(String(init?.body)),
    ])
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AddToPlaylist', () => {
  it('adds the scenario to the playlist picked', async () => {
    const fetchMock = renderAdd({
      '/playlists': { body: [playlist('a'), playlist('b')] },
      '/playlists/b/scenarios': { status: 201, body: { ...playlist('b', ['scn']), entries: [] } },
    })

    await userEvent.click(screen.getByRole('button', { name: '+ Add to playlist' }))
    await userEvent.click(await screen.findByRole('button', { name: 'B' }))

    expect(posts(fetchMock)).toEqual([['/playlists/b/scenarios', { scenarioId: 'scn' }]])
    expect(screen.getByRole('status')).toHaveTextContent('Added to B.')
    expect(screen.getByRole('button', { name: '✓ B' })).toBeDisabled()
  })

  it('marks playlists that already hold the scenario', async () => {
    renderAdd({ '/playlists': { body: [playlist('a', ['scn'])] } })

    await userEvent.click(screen.getByRole('button', { name: '+ Add to playlist' }))

    expect(await screen.findByRole('button', { name: '✓ A' })).toBeDisabled()
  })

  it('creates a playlist and adds the scenario to it', async () => {
    const fetchMock = renderAdd({ '/playlists': { body: [] } })
    fetchMock.mockImplementation(async (input, init) => {
      const path = new URL(String(input), window.location.href).pathname
      if (init?.method !== 'POST') return Response.json([])
      return path.endsWith('/scenarios')
        ? Response.json({ ...playlist('new1', ['scn']), entries: [] }, { status: 201 })
        : Response.json({ ...playlist('new1'), name: 'Warmups' }, { status: 201 })
    })

    await userEvent.click(screen.getByRole('button', { name: '+ Add to playlist' }))
    await screen.findByText("You don't have any playlists yet.")
    await userEvent.type(screen.getByLabelText('New playlist name'), 'Warmups')
    await userEvent.click(screen.getByRole('button', { name: 'Create & add' }))

    expect(posts(fetchMock)).toEqual([
      ['/playlists', { name: 'Warmups', isPublic: false }],
      ['/playlists/new1/scenarios', { scenarioId: 'scn' }],
    ])
    expect(screen.getByRole('status')).toHaveTextContent('Added to Warmups.')
    expect(screen.getByRole('button', { name: '✓ Warmups' })).toBeDisabled()
  })

  it('shows why the API refused a duplicate', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderAdd({
      '/playlists': { body: [playlist('a')] },
      '/playlists/a/scenarios': {
        status: 409,
        body: { detail: 'Scenario is already in this playlist' },
      },
    })

    await userEvent.click(screen.getByRole('button', { name: '+ Add to playlist' }))
    await userEvent.click(await screen.findByRole('button', { name: 'A' }))

    expect(screen.getByRole('status')).toHaveTextContent('Scenario is already in this playlist')
  })
})
