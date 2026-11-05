import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getDoc } from 'firebase/firestore'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ratingEvent, sessionSnapshot } from '@/test/multiplayer'

import { MatchResults } from './MatchResults'

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  doc: vi.fn((_db, collection: string, id: string) => ({ path: `${collection}/${id}` })),
  getDoc: vi.fn(),
}))

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i)

function finishedMatch() {
  const snapshot = sessionSnapshot({ state: 'complete', completionReason: 'completed' })
  const [me, them] = snapshot.participants
  Object.assign(me!, { score: 0.8, beatsHit: 48, hitBeats: range(0, 48) })
  Object.assign(them!, { score: 0.5, beatsHit: 30, hitBeats: [...range(0, 25), ...range(55, 60)] })
  snapshot.ratingEvents = [
    ratingEvent(),
    ratingEvent({
      uid: 'user-2',
      opponentUid: 'user-1',
      outcome: 'loss',
      score: 0.5,
      opponentScore: 0.8,
      eloBefore: 450,
      opponentEloBefore: 400,
      eloAfter: 431.7,
      eloDelta: -18.3,
      expectedScore: 0.5715,
      actualScore: 0,
      gamesPlayedAfter: 25,
      isProvisional: false,
      tierAfter: 'silver',
    }),
  ]
  return snapshot
}

function publicProfile() {
  vi.mocked(getDoc).mockResolvedValue({
    exists: () => true,
    data: () => ({
      username: 'jazzhands',
      displayName: 'Player Two',
      avatarUrl: 'https://example.com/two.png',
      bio: 'Keys and coffee.',
    }),
  } as never)
}

function renderResults(snapshot = finishedMatch(), selfUid = 'user-1') {
  const onHome = vi.fn()
  render(<MatchResults snapshot={snapshot} selfUid={selfUid} onHome={onHome} buttonClass="" />)
  return onHome
}

beforeEach(() => {
  publicProfile()
})

describe('MatchResults', () => {
  it('announces the result', () => {
    renderResults()
    const outcome = screen.getByRole('status', { name: 'Match outcome' })
    expect(outcome).toHaveTextContent('You won!')
    expect(outcome).toHaveTextContent('Win · Shared riff · piano')
  })

  it('shows the loss to the other player', () => {
    const snapshot = finishedMatch()
    renderResults(snapshot, 'user-2')
    expect(screen.getByRole('status', { name: 'Match outcome' })).toHaveTextContent('You lost')
  })

  it('shows a tie', () => {
    const snapshot = finishedMatch()
    snapshot.ratingEvents = snapshot.ratingEvents.map((event) => ({ ...event, outcome: 'draw' }))
    renderResults(snapshot)
    expect(screen.getByRole('status', { name: 'Match outcome' })).toHaveTextContent("It's a tie")
  })

  it('introduces the opponent with their public profile', async () => {
    renderResults()
    const opponent = screen.getByRole('region', { name: 'Your opponent' })

    expect(await within(opponent).findByText('@jazzhands')).toBeInTheDocument()
    expect(
      within(opponent).getByRole('img', { name: "Player Two's profile picture" }),
    ).toHaveAttribute('src', 'https://example.com/two.png')
    expect(within(opponent).getByText('Keys and coffee.')).toBeInTheDocument()
    expect(opponent).toHaveTextContent('Instrumentpiano')
    expect(opponent).toHaveTextContent('Elo432 (-18)')
    expect(opponent).toHaveTextContent('Ranksilver')
    expect(opponent).toHaveTextContent('Rated matches25')
    expect(within(opponent).getByText('Strengths')).toBeInTheDocument()
    expect(within(opponent).getByText('Weaknesses')).toBeInTheDocument()
    // They lost the thread for 30 beats in the middle.
    expect(opponent).toHaveTextContent('Lost the beat for 30 beats in a row from beat 26.')
  })

  it('keeps private profiles private', async () => {
    vi.mocked(getDoc).mockRejectedValue(new Error('permission-denied'))
    renderResults()
    const opponent = screen.getByRole('region', { name: 'Your opponent' })
    expect(await within(opponent).findByText('This profile is private.')).toBeInTheDocument()
    expect(within(opponent).getByText('Player Two')).toBeInTheDocument()
  })

  it('breaks down both scores side by side', () => {
    renderResults()
    const mine = screen.getByRole('article', { name: 'You breakdown' })
    const theirs = screen.getByRole('article', { name: 'Player Two breakdown' })

    expect(mine).toHaveTextContent('Score80%')
    expect(mine).toHaveTextContent('Beats hit48/60')
    expect(mine).toHaveTextContent('Longest streak48 beats')
    expect(theirs).toHaveTextContent('Score50%')
    expect(theirs).toHaveTextContent('Missed30')
    expect(within(mine).getByRole('img', { name: 'You: 48 of 60 beats hit' })).toBeInTheDocument()
  })

  it('explains how the Elo changed', () => {
    renderResults()
    const elo = screen.getByRole('region', { name: 'Elo explained' })
    expect(elo).toHaveTextContent('Elo expected you to score 43% of the result')
    expect(elo).toHaveTextContent('32 × (1 − 0.43) = +18.3, so you are now rated 418.3')
    expect(within(elo).getByLabelText('Rating change')).toHaveTextContent('400 → 418.3')
  })

  it('suggests what to work on', () => {
    renderResults()
    const improve = screen.getByRole('region', { name: 'Areas for improvement' })
    expect(within(improve).getByText('Your strengths')).toBeInTheDocument()
    expect(within(improve).getByText('Your weaknesses')).toBeInTheDocument()
    expect(improve).toHaveTextContent('You hit 48 of 60 beats')
  })

  it('only counts the beats played when the match was cut short', () => {
    const snapshot = finishedMatch()
    snapshot.participants[0]!.hitBeats = range(0, 10)
    snapshot.participants[1]!.hitBeats = range(0, 5)
    snapshot.ratingEvents = snapshot.ratingEvents.map((event) => ({
      ...event,
      reason: 'resigned',
    }))
    renderResults(snapshot)
    expect(screen.getByRole('article', { name: 'You breakdown' })).toHaveTextContent(
      'Beats hit10/10',
    )
    expect(screen.getByRole('status', { name: 'Match outcome' })).toHaveTextContent(
      'decided by resignation',
    )
  })

  it('returns home', async () => {
    const onHome = renderResults()
    await userEvent.click(screen.getByRole('button', { name: 'Return Home' }))
    expect(onHome).toHaveBeenCalledOnce()
  })
})
