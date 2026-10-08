import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'

import { useSession } from '@/lib/multiplayer/useSession'
import { sessionSnapshot } from '@/test/multiplayer'
import { renderAtRoute, signedIn } from '@/test/render'
import { MultiplayerSession } from './MultiplayerSession'

vi.mock('@/lib/multiplayer/useSession', () => ({ useSession: vi.fn() }))
vi.mock('@/components/LiveElo', () => ({ LiveElo: () => <span>400 Elo</span> }))
const send = vi.fn()
const retry = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSession).mockReturnValue({
    snapshot: sessionSnapshot(),
    receivedAt: performance.now(),
    connection: 'connected',
    error: null,
    send,
    retry,
  })
})
function renderSession() {
  return renderAtRoute(<MultiplayerSession />, {
    path: '/multiplayer/:matchId',
    route: '/multiplayer/match-1',
    auth: signedIn(),
  })
}

it('shows the shared scenario, opponent, ready control and keyboard preset messages', async () => {
  renderSession()
  expect(screen.getByRole('region', { name: 'Matched opponent' })).toHaveTextContent('Shared riff')
  expect(screen.getByRole('article', { name: 'Opponent performance' })).toHaveTextContent(
    'Player Two',
  )
  await userEvent.click(screen.getByRole('button', { name: 'Ready to play' }))
  expect(send).toHaveBeenCalledWith('ready')
  fireEvent.keyDown(window, { key: 'ArrowUp' })
  expect(send).toHaveBeenCalledWith('emote', 'well_done')
})

it('keeps play available during an opponent disconnect and requires an explicit resignation', async () => {
  const snapshot = sessionSnapshot({ state: 'in_progress', startedAtMs: 1_700_000_000_000 })
  snapshot.participants[1]!.connected = false
  snapshot.participants[1]!.reconnectUntilMs = snapshot.serverTimeMs + 20_000
  vi.mocked(useSession).mockReturnValue({
    snapshot,
    receivedAt: performance.now(),
    connection: 'connected',
    error: null,
    send,
    retry: vi.fn(),
  })
  renderSession()
  expect(screen.getByText(/Opponent disconnected/)).toHaveTextContent('20s to rejoin')
  await userEvent.click(screen.getByRole('button', { name: /Tap beat/ }))
  expect(send).toHaveBeenCalledWith('demo_hit')
  await userEvent.click(screen.getByRole('button', { name: 'Resign' }))
  expect(send).not.toHaveBeenCalledWith('resign')
  expect(screen.getByRole('dialog')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Confirm resign' }))
  expect(send).toHaveBeenCalledWith('resign')
})

it('labels demo input and prevents play before the authoritative start time', () => {
  const snapshot = sessionSnapshot({ state: 'in_progress', startedAtMs: 1_700_000_003_000 })
  vi.mocked(useSession).mockReturnValue({
    snapshot,
    receivedAt: performance.now(),
    connection: 'connected',
    error: null,
    send,
    retry: vi.fn(),
  })
  renderSession()
  expect(screen.getByText(/Instrument scoring is not connected/)).toBeVisible()
  expect(screen.getByRole('button', { name: /Tap beat/ })).toBeDisabled()
})

it('shows match details during reconnect and disables live actions until connected', async () => {
  const snapshot = sessionSnapshot({ state: 'in_progress', startedAtMs: 1_700_000_000_000 })
  snapshot.participants[0]!.score = 0.1
  snapshot.participants[0]!.beatsHit = 6
  snapshot.participants[1]!.connected = false
  vi.mocked(useSession).mockReturnValue({
    snapshot,
    receivedAt: performance.now(),
    connection: 'disconnected',
    error: 'Connection lost. Reconnecting…',
    send,
    retry,
  })
  renderSession()
  expect(screen.getByRole('region', { name: 'Reconnecting to match' })).toBeVisible()
  expect(screen.getByRole('region', { name: 'Multiplayer match' })).toHaveTextContent('Shared riff')
  expect(screen.getByRole('region', { name: 'Multiplayer match' })).toHaveTextContent('piano')
  expect(screen.getByRole('region', { name: 'Multiplayer match' })).toHaveTextContent(
    'Difficulty 1/10',
  )
  expect(screen.getByRole('article', { name: 'Your performance' })).toHaveTextContent(
    '6/60 demo beats',
  )
  expect(screen.getByRole('article', { name: 'Opponent performance' })).toHaveTextContent(
    'Player Two',
  )
  expect(screen.getByRole('progressbar', { name: 'Match progress' })).toBeVisible()
  expect(screen.getByRole('button', { name: /Tap beat/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Resign' })).toBeDisabled()
  expect(screen.getByRole('button', { name: /Well done!/ })).toBeDisabled()
  expect(screen.queryByText(/Opponent disconnected/)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
  expect(retry).toHaveBeenCalledOnce()
})
