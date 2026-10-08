import { act, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Timestamp } from 'firebase/firestore'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useSkillRatings } from '@/lib/ratings/useSkillRatings'
import { useRatingHistory } from '@/lib/ratings/useRatingHistory'
import type { Instrument, RatingEvent } from '@/lib/schema/types'
import { Home } from '@/pages/Home'
import { RatingHistory } from '@/pages/RatingHistory'
import { renderWithAuth, signedIn } from '@/test/render'

type Snapshot = { docs: { data: () => unknown }[]; data: () => Record<string, unknown> }
const { listeners, settings, updateDoc } = vi.hoisted(() => ({
  settings: new Map<string, Record<string, unknown>>(),
  updateDoc: vi.fn(),
  listeners: new Map<
    string,
    {
      next: (snapshot: Snapshot) => void
      error: () => void
      unsubscribe: ReturnType<typeof vi.fn>
    }
  >(),
}))

vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/firestore')>()),
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
  query: (ref: { path: string }) => ref,
  updateDoc,
  onSnapshot: (ref: { path: string }, next: (snapshot: Snapshot) => void, error: () => void) => {
    const unsubscribe = vi.fn()
    listeners.set(ref.path, { next, error, unsubscribe })
    if (settings.has(ref.path)) next({ docs: [], data: () => settings.get(ref.path)! })
    return unsubscribe
  },
}))

const now = Timestamp.fromDate(new Date('2026-10-07T20:00:00Z'))
const event: RatingEvent = {
  matchId: 'match-1',
  uid: 'user-1',
  opponentUid: 'opponent',
  instrument: 'piano',
  outcome: 'win',
  reason: 'completed',
  score: 0.9,
  opponentScore: 0.7,
  eloBefore: 400,
  opponentEloBefore: 400,
  eloAfter: 416,
  eloDelta: 16,
  expectedScore: 0.5,
  actualScore: 1,
  kFactor: 32,
  gamesPlayedBefore: 0,
  gamesPlayedAfter: 1,
  isProvisional: true,
  tierAfter: 'bronze',
  modelVersion: 'elo-v1',
  appliedAt: now,
}

function emit(path: string, documents: unknown[] = [], data: Record<string, unknown> = {}) {
  const listener = listeners.get(path)
  if (!listener) throw new Error('No subscription at ' + path)
  act(() =>
    listener.next({ docs: documents.map((item) => ({ data: () => item })), data: () => data }),
  )
}

function emitRating(elo = 400, instrument: Instrument = 'piano') {
  emit('users/user-1/skillRatings', [
    {
      uid: 'user-1',
      instrument,
      elo,
      tier: 'bronze',
      gamesPlayed: elo === 400 ? 0 : 1,
      isProvisional: true,
      updatedAt: now,
    },
  ])
}

beforeEach(() => {
  listeners.clear()
  settings.clear()
  updateDoc
    .mockReset()
    .mockImplementation(async (ref: { path: string }, data: Record<string, unknown>) => {
      settings.set(ref.path, data)
      listeners.get(ref.path)?.next({ docs: [], data: () => data })
    })
})

describe('live rating subscriptions', () => {
  it('uses the preferred instrument and updates ratings without a reload', () => {
    const { result } = renderHook(() => useSkillRatings('user-1'))
    expect(result.current.loading).toBe(true)
    emitRating(400, 'guitar')
    emit('userSettings/user-1', [], { preferredInstrument: 'guitar' })
    expect(result.current.preferredInstrument).toBe('guitar')
    expect(result.current.ratings[0].elo).toBe(400)
    emitRating(416, 'guitar')
    expect(result.current.ratings[0].elo).toBe(416)
  })

  it('cleans up subscriptions and hides the previous account immediately', () => {
    const { result, rerender } = renderHook(({ uid }) => useSkillRatings(uid), {
      initialProps: { uid: 'user-1' },
    })
    emitRating()
    const previous = listeners.get('users/user-1/skillRatings')!
    rerender({ uid: 'user-2' })
    expect(previous.unsubscribe).toHaveBeenCalledOnce()
    expect(result.current.ratings).toEqual([])
    expect(result.current.loading).toBe(true)
  })

  it('reports a failed subscription without fabricating a starting rating', () => {
    const { result } = renderHook(() => useSkillRatings('user-1'))
    act(() => listeners.get('users/user-1/skillRatings')!.error())
    expect(result.current.ratings).toEqual([])
    expect(result.current.error).toBe('Could not load your ratings.')
  })

  it('makes no database calls when signed out', () => {
    renderHook(() => useSkillRatings(undefined))
    expect(listeners.size).toBe(0)
  })

  it('hides stale history when switching instruments', () => {
    const { result, rerender } = renderHook(
      ({ instrument }: { instrument: Instrument }) => useRatingHistory('user-1', instrument),
      { initialProps: { instrument: 'piano' as Instrument } },
    )
    emit('users/user-1/skillRatings/piano/history', [event])
    expect(result.current.events).toHaveLength(1)
    const previous = listeners.get('users/user-1/skillRatings/piano/history')!
    rerender({ instrument: 'guitar' })
    expect(result.current.events).toEqual([])
    expect(previous.unsubscribe).toHaveBeenCalledOnce()
  })
})

describe('Elo UI', () => {
  it('shows live Elo beside the username without navigating away', () => {
    renderWithAuth(<Home />, { auth: signedIn(), route: '/home' })
    emitRating()
    expect(screen.getByText('Piano-400')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /View piano Elo/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    emitRating(416)
    expect(screen.getByText('Piano-416')).toBeInTheDocument()
    expect(screen.queryByText('Piano-400')).not.toBeInTheDocument()
  })

  it('opens Elo details, saves the instrument and restores it after remount', async () => {
    const mounted = renderWithAuth(<Home />, { auth: signedIn(), route: '/home' })
    emitRating()
    await userEvent.click(screen.getByRole('button', { name: /View piano Elo/ }))
    expect(screen.getByRole('region', { name: 'Elo details' })).toHaveTextContent(
      'Beating a stronger opponent',
    )
    await userEvent.selectOptions(screen.getByLabelText('Instrument'), 'guitar')
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'userSettings/user-1' },
      expect.objectContaining({ preferredInstrument: 'guitar' }),
    )
    emitRating(450, 'guitar')
    expect(screen.getByRole('button', { name: /View guitar Elo/ })).toHaveTextContent('Guitar-450')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Elo details' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /View guitar Elo/ })).toHaveFocus()
    mounted.unmount()
    renderWithAuth(<Home />, { auth: signedIn(), route: '/home' })
    emitRating(450, 'guitar')
    await userEvent.click(screen.getByRole('button', { name: /View guitar Elo/ }))
    expect(screen.getByLabelText('Instrument')).toHaveValue('guitar')
  })

  it('shows a failed preference save and retains the previous instrument', async () => {
    updateDoc.mockRejectedValueOnce(new Error('permission-denied'))
    renderWithAuth(<Home />, { auth: signedIn(), route: '/home' })
    emitRating()
    await userEvent.click(screen.getByRole('button', { name: /View piano Elo/ }))
    await userEvent.selectOptions(screen.getByLabelText('Instrument'), 'guitar')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your instrument')
    expect(screen.getByLabelText('Instrument')).toHaveValue('piano')
  })

  it('shows empty history then renders a committed rating breakdown', () => {
    renderWithAuth(<RatingHistory />, { auth: signedIn(), route: '/ratings' })
    emitRating()
    emit('users/user-1/skillRatings/piano/history')
    expect(screen.getByText(/No rated matches yet/)).toBeInTheDocument()
    emitRating(416)
    emit('users/user-1/skillRatings/piano/history', [event])
    expect(screen.getByRole('heading', { name: 'Win' })).toBeInTheDocument()
    expect(screen.getByLabelText('Rating change')).toHaveTextContent('400 → 416 (+16)')
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(screen.getByText('70%')).toBeInTheDocument()
    expect(screen.queryByText(/No rated matches yet/)).not.toBeInTheDocument()
  })

  it('switches instruments without showing the previous result', async () => {
    renderWithAuth(<RatingHistory />, { auth: signedIn() })
    emitRating()
    emit('users/user-1/skillRatings/piano/history', [event])
    await userEvent.selectOptions(screen.getByLabelText('Instrument'), 'guitar')
    expect(screen.queryByRole('heading', { name: 'Win' })).not.toBeInTheDocument()
    emit('users/user-1/skillRatings/guitar/history')
    expect(screen.getByText(/No rated matches yet/)).toBeInTheDocument()
  })

  it('renders rating and history permission errors', () => {
    renderWithAuth(<RatingHistory />, { auth: signedIn() })
    act(() => {
      listeners.get('users/user-1/skillRatings')!.error()
      listeners.get('users/user-1/skillRatings/piano/history')!.error()
    })
    expect(screen.getAllByRole('alert')).toHaveLength(2)
  })
})
