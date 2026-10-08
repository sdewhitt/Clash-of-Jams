import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Home } from '@/pages/Home'
import { MultiplayerConnect } from '@/pages/MultiplayerConnect'
import { renderAtRoute, signedIn } from '@/test/render'

import { cancelQueue, getQueueStatus, joinQueue, type QueueStatus } from './api'
import { useActiveMatch, useMatchmaking } from './useMatchmaking'

vi.mock('./api', () => ({ joinQueue: vi.fn(), getQueueStatus: vi.fn(), cancelQueue: vi.fn() }))
vi.mock('@/components/LiveElo', () => ({ LiveElo: () => <span>400 Elo</span> }))

const idle: QueueStatus = {
  state: 'idle',
  queueId: null,
  instrument: null,
  waitSeconds: 0,
  ratingWindow: null,
  waitingFor: null,
  match: null,
  policyVersion: 'matchmaking-v1',
}
const queued: QueueStatus = {
  ...idle,
  state: 'queued',
  queueId: 'ticket-1',
  instrument: 'piano',
  ratingWindow: 75,
  waitingFor: 'opponent',
}
const matched: QueueStatus = {
  ...queued,
  state: 'matched',
  match: {
    id: 'match-1',
    state: 'lobby',
    instrument: 'piano',
    scenarioId: 'scenario-1',
    scenarioVersionId: 'version-1',
    scenarioTitle: 'Shared riff',
    scenarioDifficulty: 1,
    difficultySource: 'author',
    participants: [
      { uid: 'user-1', displayName: 'Player One', elo: 400, isProvisional: true },
      { uid: 'user-2', displayName: 'Player Two', elo: 410, isProvisional: true },
    ],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(joinQueue).mockResolvedValue(queued)
  vi.mocked(getQueueStatus).mockResolvedValue(queued)
  vi.mocked(cancelQueue).mockResolvedValue(idle)
})
afterEach(() => vi.useRealTimers())

describe('queue lifecycle', () => {
  it('joins automatically and StrictMode cleanup does not cancel its own queue', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useMatchmaking('user-1'), { wrapper: StrictMode })
    await act(async () => {})
    expect(result.current.status?.queueId).toBe('ticket-1')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(cancelQueue).not.toHaveBeenCalled()
    vi.mocked(getQueueStatus).mockResolvedValue(matched)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(result.current.status?.match?.id).toBe('match-1')
  })

  it('waits for a pending join before explicitly cancelling its ticket', async () => {
    let finish!: (status: QueueStatus) => void
    vi.mocked(joinQueue).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { result } = renderHook(() => useMatchmaking('user-1'))
    let leaving!: Promise<void>
    act(() => {
      leaving = result.current.cancel()
    })
    expect(result.current.leaving).toBe(true)
    await act(async () => {
      finish(queued)
      await leaving
    })
    expect(cancelQueue).toHaveBeenCalledWith('ticket-1')
    expect(result.current.status).toBeNull()
  })

  it('unmount cancels only the queue and preserves an assigned lobby', async () => {
    vi.useFakeTimers()
    vi.mocked(joinQueue).mockResolvedValue(matched)
    const { unmount } = renderHook(() => useMatchmaking('user-1'))
    await act(async () => {})
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(cancelQueue).toHaveBeenCalledWith('ticket-1', true, false)
  })

  it('rejoins after lease expiration without overlapping polls', async () => {
    vi.useFakeTimers()
    vi.mocked(getQueueStatus).mockResolvedValue(idle)
    renderHook(() => useMatchmaking('user-1'))
    await act(async () => {})
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(joinQueue).toHaveBeenCalledTimes(2)
  })

  it('does not show the previous account assignment while the new account loads', async () => {
    vi.mocked(joinQueue).mockResolvedValue(matched)
    const { result, rerender } = renderHook(({ uid }) => useMatchmaking(uid), {
      initialProps: { uid: 'user-1' },
    })
    await waitFor(() => expect(result.current.status?.state).toBe('matched'))
    vi.mocked(joinQueue).mockReturnValue(new Promise(() => {}))
    rerender({ uid: 'new-user' })
    expect(result.current.status).toBeNull()
  })

  it('cancels the new ticket when leaving during an automatic rejoin', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useMatchmaking('user-1'))
    await act(async () => {})
    vi.mocked(getQueueStatus).mockResolvedValue(idle)
    let finish!: (status: QueueStatus) => void
    vi.mocked(joinQueue).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    let leaving!: Promise<void>
    act(() => {
      leaving = result.current.cancel()
    })
    await act(async () => {
      finish({ ...queued, queueId: 'new-ticket' })
      await leaving
    })
    expect(cancelQueue).toHaveBeenCalledWith('new-ticket')
  })

  it('signed-out hooks make no requests', () => {
    renderHook(() => useMatchmaking(undefined))
    renderHook(() => useActiveMatch(undefined))
    expect(joinQueue).not.toHaveBeenCalled()
    expect(getQueueStatus).not.toHaveBeenCalled()
  })
})

describe('matchmaking UI', () => {
  it('shows brief queue copy and cancelling returns Home', async () => {
    renderAtRoute(<MultiplayerConnect />, {
      path: '/multiplayer',
      auth: signedIn(),
    })
    expect(screen.getByRole('status')).toHaveTextContent('Finding a suitable opponent')
    await waitFor(() => expect(joinQueue).toHaveBeenCalled())
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByTestId('location')).toHaveTextContent('/home')
    expect(cancelQueue).toHaveBeenCalledWith('ticket-1')
  })

  it('shows the opponent and shared version, then explicitly leaves the lobby', async () => {
    vi.mocked(joinQueue).mockResolvedValue(matched)
    renderAtRoute(<MultiplayerConnect />, { path: '/multiplayer', auth: signedIn() })
    const panel = await screen.findByRole('region', { name: 'Matched opponent' })
    expect(panel).toHaveAttribute('data-scenario-version', 'version-1')
    expect(panel).toHaveTextContent('Player Two · 410 Elo')
    expect(panel).toHaveTextContent('Shared riff')
    await userEvent.click(screen.getByRole('button', { name: 'Leave lobby' }))
    expect(await screen.findByTestId('location')).toHaveTextContent('/home')
    expect(cancelQueue).toHaveBeenCalledWith('ticket-1')
  })

  it('failed join is visible and the player can still exit', async () => {
    vi.mocked(joinQueue).mockRejectedValue(new Error('Service unavailable'))
    renderAtRoute(<MultiplayerConnect />, { path: '/multiplayer', auth: signedIn() })
    expect(await screen.findByRole('alert')).toHaveTextContent('Service unavailable')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByTestId('location')).toHaveTextContent('/home')
  })

  it('Try again rejoins after a connection failure and clears the error', async () => {
    vi.mocked(joinQueue).mockRejectedValueOnce(new Error('Could not reach the server.'))
    renderAtRoute(<MultiplayerConnect />, { path: '/multiplayer', auth: signedIn() })
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(joinQueue).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cancelQueue).toHaveBeenCalledWith('ticket-1')
  })

  it('Recent Matches is directly below Online Play and opens its own page', async () => {
    vi.mocked(getQueueStatus).mockResolvedValue(idle)
    renderAtRoute(<Home />, { auth: signedIn(), path: '/home' })
    const buttons = screen.getAllByRole('button')
    const online = screen.getByRole('button', { name: 'Online Play' })
    expect(buttons[buttons.indexOf(online) + 1]).toHaveTextContent('Recent Matches')
    await userEvent.click(screen.getByRole('button', { name: 'Recent Matches' }))
    expect(await screen.findByTestId('location')).toHaveTextContent('/recent_matches')
  })

  it('Home offers rejoin for an assigned lobby without joining a queue', async () => {
    vi.mocked(getQueueStatus).mockResolvedValue(matched)
    renderAtRoute(<Home />, { auth: signedIn(), path: '/home' })
    await userEvent.click(await screen.findByRole('button', { name: /Rejoin Multiplayer/i }))
    expect(await screen.findByTestId('location')).toHaveTextContent('/multiplayer_connect')
    expect(joinQueue).not.toHaveBeenCalled()
  })
})
