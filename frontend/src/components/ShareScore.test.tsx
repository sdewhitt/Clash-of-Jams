/**
 * User story #37 on the results screen: send the run's score to friends. Firestore is mocked
 * at lib/scores/share; the rules side is in tests/rules/scoreShares.test.ts.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ShareScore, type ShareScoreProps } from '@/components/ShareScore'
import { listFriends, shareScore } from '@/lib/scores/share'

vi.mock('@/lib/scores/share', () => ({
  listFriends: vi.fn(),
  shareScore: vi.fn(async () => 'share-1'),
}))

function renderShare(overrides: Partial<ShareScoreProps> = {}) {
  return render(
    <ShareScore
      scenarioId="scn-1"
      scenarioTitle="Ode to Joy"
      finalScore={87_500}
      runId="run-1"
      uid="user-1"
      {...overrides}
    />,
  )
}

beforeEach(() => {
  vi.mocked(shareScore).mockClear()
  vi.mocked(listFriends).mockReset()
})

describe('ShareScore', () => {
  it('sends the score to the friends picked, with a message', async () => {
    vi.mocked(listFriends).mockResolvedValue([
      { uid: 'friend-a', displayName: 'Ada' },
      { uid: 'friend-b', displayName: 'Bach' },
    ])
    renderShare()

    fireEvent.click(screen.getByRole('button', { name: 'Send to friends' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Bach' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Message' }), {
      target: { value: '  Beat that  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Sent to 1 friend.')).toBeInTheDocument()
    expect(shareScore).toHaveBeenCalledWith({
      ownerUid: 'user-1',
      runId: 'run-1',
      scenarioId: 'scn-1',
      scenarioTitle: 'Ode to Joy',
      finalScore: 87_500,
      message: 'Beat that',
      recipientUids: ['friend-b'],
    })
  })

  it('cannot send until a friend is picked', async () => {
    vi.mocked(listFriends).mockResolvedValue([{ uid: 'friend-a', displayName: 'Ada' }])
    renderShare()

    fireEvent.click(screen.getByRole('button', { name: 'Send to friends' }))

    expect(await screen.findByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('explains when there are no friends to send to', async () => {
    vi.mocked(listFriends).mockResolvedValue([])
    renderShare()

    fireEvent.click(screen.getByRole('button', { name: 'Send to friends' }))

    expect(await screen.findByText(/no friends to send this to yet/)).toBeInTheDocument()
  })

  it('reports a failed send', async () => {
    vi.mocked(listFriends).mockResolvedValue([{ uid: 'friend-a', displayName: 'Ada' }])
    vi.mocked(shareScore).mockRejectedValueOnce(new Error('permission-denied'))
    renderShare()

    fireEvent.click(screen.getByRole('button', { name: 'Send to friends' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Ada' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('could not be sent')
  })

  it('waits for the run to be saved before it can be sent', () => {
    renderShare({ runId: null })

    expect(screen.getByRole('button', { name: 'Send to friends' })).toBeDisabled()
  })
})
