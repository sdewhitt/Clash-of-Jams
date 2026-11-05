import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { renderAtRoute, signedIn } from '@/test/render'
import { SpectatorMatch } from './SpectatorMatch'

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'user-1', getIdToken: async () => 'spectator-token' } },
}))

afterEach(() => vi.unstubAllGlobals())

it('shows both players, sends a preset reaction, and clears the view on opt-out', async () => {
  const connection = {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1,
    onopen: () => {},
    onmessage: (_event: { data: string }) => {},
    onclose: (_event: { code: number }) => {},
  }
  const socket = vi.fn(function () {
    return connection
  })
  Object.assign(socket, { OPEN: 1 })
  vi.stubGlobal('WebSocket', socket)
  renderAtRoute(<SpectatorMatch />, {
    path: '/spectate/:matchId',
    route: '/spectate/match-1',
    auth: signedIn(),
  })

  await waitFor(() =>
    expect(socket).toHaveBeenCalledWith(expect.stringMatching(/match-1\/spectate$/)),
  )
  connection.onopen()
  expect(JSON.parse(connection.send.mock.calls[0]![0])).toEqual({
    token: 'spectator-token',
    visit: expect.any(String),
  })

  act(() =>
    connection.onmessage({
      data: JSON.stringify({
        state: 'in_progress',
        scenarioTitle: 'Shared riff',
        elapsedMs: 5000,
        durationMs: 10000,
        totalBeats: 10,
        players: [
          { name: 'Player One', score: 0.4, beatsHit: 4, outcome: null },
          { name: 'Player Two', score: 0.2, beatsHit: 2, outcome: null },
        ],
        messages: [{ id: 5, author: null, text: 'Friend joined as a spectator', reactions: {} }],
      }),
    }),
  )
  expect(screen.getByRole('heading', { name: 'Player One' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Player Two' })).toBeVisible()
  expect(screen.getByText('Score 40%')).toBeVisible()
  expect(screen.getByText('Score 20%')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Applause reaction, 0' }))
  expect(JSON.parse(connection.send.mock.lastCall![0])).toEqual({
    type: 'reaction',
    messageId: 5,
    reaction: '👏',
  })

  act(() => connection.onclose({ code: 4410 }))
  expect(screen.getByRole('status')).toHaveTextContent('Spectating was turned off.')
  expect(screen.queryByText('Score 40%')).not.toBeInTheDocument()
})
