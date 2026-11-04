/**
 * User story #36: the list of the caller's playlists, and creating one.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Playlist } from '@/lib/playlists'
import { Playlists } from '@/pages/Playlists'
import { stubApi } from '@/test/api'
import { renderAtRoute, signedIn } from '@/test/render'

function playlist(id: string, overrides: Partial<Playlist> = {}): Playlist {
  return {
    id,
    ownerUid: 'user-1',
    name: id,
    description: '',
    isPublic: false,
    scenarioIds: [],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

function renderPlaylists(response: { status?: number; body: unknown }) {
  const fetchMock = stubApi({ '/playlists': response })
  renderAtRoute(<Playlists />, { path: '/playlists', auth: signedIn() })
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Playlists', () => {
  it('lists my playlists with how many scenarios each holds', async () => {
    renderPlaylists({
      body: [
        playlist('Cooldowns', { scenarioIds: ['a'] }),
        playlist('Warmups', { scenarioIds: ['a', 'b'], isPublic: true }),
      ],
    })

    expect(await screen.findByRole('button', { name: /Cooldowns.*1 scenario$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Warmups.*Shared.*2 scenarios/ })).toBeInTheDocument()
  })

  it('opens a playlist', async () => {
    renderPlaylists({ body: [playlist('p1', { name: 'Warmups' })] })

    await userEvent.click(await screen.findByRole('button', { name: /Warmups/ }))

    expect(screen.getByTestId('location')).toHaveTextContent('/playlists/p1')
  })

  it('says when there are no playlists yet', async () => {
    renderPlaylists({ body: [] })

    expect(await screen.findByText(/You don't have any playlists yet/)).toBeInTheDocument()
  })

  it('creates a playlist and opens it', async () => {
    const fetchMock = renderPlaylists({ body: [] })
    fetchMock.mockImplementation(async (_input, init) =>
      Response.json(init?.method === 'POST' ? playlist('new1', { name: 'Warmups' }) : []),
    )
    await screen.findByText(/You don't have any playlists yet/)

    await userEvent.type(screen.getByLabelText('New playlist'), '  Warmups ')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: 'Warmups', isPublic: false })
    expect(screen.getByTestId('location')).toHaveTextContent('/playlists/new1')
  })

  it('won’t create a playlist with an empty name', async () => {
    const fetchMock = renderPlaylists({ body: [] })
    await screen.findByText(/You don't have any playlists yet/)

    await userEvent.type(screen.getByLabelText('New playlist'), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Give your playlist a name.')
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('shows an error when the playlists can’t load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderPlaylists({ status: 500, body: {} })

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your playlists.")
  })
})
