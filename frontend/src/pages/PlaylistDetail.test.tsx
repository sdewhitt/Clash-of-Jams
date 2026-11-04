/**
 * User story #36: one playlist's page, for its owner and for someone it is shared with.
 */
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PlaylistDetail as Detail, PlaylistEntry } from '@/lib/playlists'
import { PlaylistDetail } from '@/pages/PlaylistDetail'
import { stubApi } from '@/test/api'
import { renderAtRoute, signedIn } from '@/test/render'

const ME = 'user-1'

function entry(scenarioId: string, available = true): PlaylistEntry {
  return { scenarioId, title: available ? scenarioId.toUpperCase() : null, available }
}

function playlist(entries: PlaylistEntry[], overrides: Partial<Detail> = {}): Detail {
  return {
    id: 'p1',
    ownerUid: ME,
    name: 'Warmups',
    description: '',
    isPublic: false,
    scenarioIds: entries.map((e) => e.scenarioId),
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    entries,
    ...overrides,
  }
}

function renderPlaylist(routes: Record<string, { status?: number; body: unknown }>) {
  const fetchMock = stubApi(routes)
  renderAtRoute(<PlaylistDetail />, {
    path: '/playlists/:playlistId',
    route: '/playlists/p1',
    auth: signedIn(),
  })
  return fetchMock
}

/** Every write the page sent: method, path and parsed body. */
function writes(fetchMock: ReturnType<typeof stubApi>) {
  return fetchMock.mock.calls
    .map(([input, init]) => ({
      method: init?.method ?? 'GET',
      path: new URL(String(input), window.location.href).pathname.replace(/^\/api\/v1/, ''),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }))
    .filter((call) => call.method !== 'GET')
}

function titles() {
  return within(screen.getByRole('list', { name: 'Scenarios' }))
    .getAllByRole('listitem')
    .map((item) => item.querySelector('p')?.textContent)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PlaylistDetail', () => {
  it('lists scenarios in play order', async () => {
    renderPlaylist({ '/playlists/p1': { body: playlist([entry('a'), entry('b')]) } })

    await screen.findByText('A')
    expect(titles()).toEqual(['A', 'B'])
  })

  it('says so when the playlist is empty', async () => {
    renderPlaylist({ '/playlists/p1': { body: playlist([]) } })

    expect(await screen.findByText(/No scenarios in this playlist yet/)).toBeInTheDocument()
  })

  it('shows a deleted scenario as unavailable, with no Play button', async () => {
    renderPlaylist({ '/playlists/p1': { body: playlist([entry('a'), entry('gone', false)]) } })

    expect(await screen.findByText('Unavailable scenario')).toBeInTheDocument()
    expect(screen.getByText('This scenario was deleted or made private')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Play / })).toHaveLength(1)
    // The owner can still clear it out.
    expect(screen.getByRole('button', { name: 'Remove Unavailable scenario' })).toBeEnabled()
  })

  it('starts a scenario straight from the playlist', async () => {
    renderPlaylist({ '/playlists/p1': { body: playlist([entry('a')]) } })

    await userEvent.click(await screen.findByRole('button', { name: 'Play A' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/play/a')
  })

  it('moves a scenario down and saves the new order', async () => {
    const fetchMock = renderPlaylist({
      '/playlists/p1': { body: playlist([entry('a'), entry('b'), entry('c')]) },
      '/playlists/p1/scenarios': { body: playlist([entry('b'), entry('a'), entry('c')]) },
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Move A down' }))

    expect(writes(fetchMock)).toEqual([
      { method: 'PUT', path: '/playlists/p1/scenarios', body: { scenarioIds: ['b', 'a', 'c'] } },
    ])
    expect(titles()).toEqual(['B', 'A', 'C'])
    expect(screen.getByRole('button', { name: 'Move B up' })).toBeDisabled()
  })

  it('removes a scenario', async () => {
    const fetchMock = renderPlaylist({
      '/playlists/p1': { body: playlist([entry('a'), entry('b')]) },
      '/playlists/p1/scenarios/a': { body: playlist([entry('b')]) },
    })

    await userEvent.click(await screen.findByRole('button', { name: 'Remove A' }))

    expect(writes(fetchMock)).toEqual([
      { method: 'DELETE', path: '/playlists/p1/scenarios/a', body: undefined },
    ])
    expect(titles()).toEqual(['B'])
  })

  it('renames the playlist', async () => {
    const fetchMock = renderPlaylist({
      '/playlists/p1': { body: playlist([], { name: 'Warmups' }) },
    })

    const field = await screen.findByLabelText('Name')
    await userEvent.clear(field)
    await userEvent.type(field, '  Cooldowns ')
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))

    expect(writes(fetchMock)).toEqual([
      { method: 'PATCH', path: '/playlists/p1', body: { name: 'Cooldowns' } },
    ])
  })

  it('won’t rename to an empty name', async () => {
    const fetchMock = renderPlaylist({ '/playlists/p1': { body: playlist([]) } })

    await userEvent.clear(await screen.findByLabelText('Name'))
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }))

    expect(screen.getByRole('alert')).toHaveTextContent('A playlist needs a name.')
    expect(writes(fetchMock)).toEqual([])
  })

  it('shares the playlist and offers its link', async () => {
    const fetchMock = renderPlaylist({ '/playlists/p1': { body: playlist([]) } })
    // The PATCH answers with the same route, so make it come back shared.
    fetchMock.mockImplementation(async (_input, init) =>
      Response.json(playlist([], { isPublic: init?.method === 'PATCH' })),
    )

    await userEvent.click(await screen.findByLabelText('Share with anyone who has the link'))

    expect(writes(fetchMock)).toEqual([
      { method: 'PATCH', path: '/playlists/p1', body: { isPublic: true } },
    ])
    expect(await screen.findByRole('button', { name: 'Copy link' })).toBeInTheDocument()
  })

  it('asks before deleting, then goes back to the playlists', async () => {
    const fetchMock = renderPlaylist({ '/playlists/p1': { body: playlist([]) } })

    await userEvent.click(await screen.findByRole('button', { name: 'Delete playlist' }))
    expect(writes(fetchMock)).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(writes(fetchMock)).toEqual([{ method: 'DELETE', path: '/playlists/p1', body: undefined }])
    expect(screen.getByTestId('location')).toHaveTextContent('/playlists')
  })

  it('is read-only for someone it is shared with', async () => {
    renderPlaylist({
      '/playlists/p1': { body: playlist([entry('a')], { ownerUid: 'someone-else', isPublic: true }) },
    })

    expect(await screen.findByRole('button', { name: 'Play A' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove A' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getByText(/Only its owner can change it/)).toBeInTheDocument()
  })

  it('explains a playlist that is missing or not shared', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderPlaylist({})

    expect(await screen.findByRole('alert')).toHaveTextContent('isn’t shared with you')
  })
})
