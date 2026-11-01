/**
 * User story #34: the play history page, and the request it makes for each page of runs.
 */
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/lib/api'
import { fetchPlayHistory, type PlayHistoryEntry } from '@/lib/runs/history'
import { PlayHistory } from '@/pages/PlayHistory'
import { callsTo, stubApi } from '@/test/api'
import { renderAtRoute, signedIn } from '@/test/render'

vi.mock('@/lib/runs/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/runs/history')>()),
  fetchPlayHistory: vi.fn(),
}))

function entry(overrides: Partial<PlayHistoryEntry> = {}): PlayHistoryEntry {
  return {
    runId: 'r1',
    scenarioId: 'scn',
    scenarioVersionId: 'v2',
    scenarioTitle: 'Warmup',
    instrument: 'guitar',
    finalScore: 87_500,
    playedAt: '2026-09-20T16:00:00Z',
    validation: 'accepted',
    matchId: null,
    scenarioAvailable: true,
    isCurrentVersion: true,
    ...overrides,
  }
}

function renderHistory() {
  return renderAtRoute(<PlayHistory />, { path: '/play_history', auth: signedIn() })
}

function rows() {
  return screen.getAllByRole('listitem')
}

beforeEach(() => {
  vi.mocked(fetchPlayHistory).mockReset()
})

describe('PlayHistory', () => {
  it('lists runs in the order the API sends them, newest first', async () => {
    vi.mocked(fetchPlayHistory).mockResolvedValue({
      entries: [
        entry({ runId: 'new', scenarioTitle: 'Newest' }),
        entry({ runId: 'old', scenarioTitle: 'Oldest', playedAt: '2026-09-01T16:00:00Z' }),
      ],
      nextBefore: null,
    })
    renderHistory()

    await screen.findByText('Newest')
    expect(rows().map((row) => within(row).getAllByRole('button')[0].textContent)).toEqual([
      'Newest',
      'Oldest',
    ])
  })

  it('shows the scenario name, instrument, score and date of each run', async () => {
    vi.mocked(fetchPlayHistory).mockResolvedValue({ entries: [entry()], nextBefore: null })
    renderHistory()

    const row = (await screen.findByText('Warmup')).closest('li') as HTMLElement
    expect(row).toHaveTextContent('guitar')
    expect(row).toHaveTextContent((87_500).toLocaleString())
    expect(row).toHaveTextContent(
      new Date('2026-09-20T16:00:00Z').toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    )
  })

  it('says so when the user has not played anything yet', async () => {
    vi.mocked(fetchPlayHistory).mockResolvedValue({ entries: [], nextBefore: null })
    renderHistory()

    expect(await screen.findByText("You haven't played any scenarios yet.")).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('shows an error when history cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(fetchPlayHistory).mockRejectedValue(new ApiError(404, 'Not Found'))
    renderHistory()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your play history.")
    expect(screen.queryByText("You haven't played any scenarios yet.")).not.toBeInTheDocument()
  })

  it("opens the scenario's preview when an entry is clicked", async () => {
    vi.mocked(fetchPlayHistory).mockResolvedValue({ entries: [entry()], nextBefore: null })
    renderHistory()

    await userEvent.click(await screen.findByRole('button', { name: 'Warmup' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/scenario_search?scenario=scn')
  })

  it("plays the scenario's current version again", async () => {
    vi.mocked(fetchPlayHistory).mockResolvedValue({ entries: [entry()], nextBefore: null })
    renderHistory()

    await userEvent.click(await screen.findByRole('button', { name: 'Play again' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/play/scn')
  })

  it('does not offer to open or play a deleted or hidden scenario', async () => {
    vi.mocked(fetchPlayHistory).mockResolvedValue({
      entries: [entry({ scenarioTitle: null, scenarioAvailable: false, isCurrentVersion: false })],
      nextBefore: null,
    })
    renderHistory()

    const row = (await screen.findByText('Unavailable scenario')).closest('li') as HTMLElement
    expect(row).toHaveTextContent('This scenario was deleted or made private')
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
  })

  it('only offers the latest version of a scenario updated since the run', async () => {
    vi.mocked(fetchPlayHistory).mockResolvedValue({
      entries: [entry({ scenarioVersionId: 'v1', isCurrentVersion: false })],
      nextBefore: null,
    })
    renderHistory()

    expect(await screen.findByText('Scenario updated since this run')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Play latest' }))

    // No ?version=: the play page loads the scenario's current version.
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/play\/scn$/)
  })

  it('loads older runs on request until there are none left', async () => {
    vi.mocked(fetchPlayHistory)
      .mockResolvedValueOnce({ entries: [entry({ runId: 'r1' })], nextBefore: 'cursor-1' })
      .mockResolvedValueOnce({
        entries: [entry({ runId: 'r2', scenarioTitle: 'Older' })],
        nextBefore: null,
      })
    renderHistory()

    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }))

    expect(await screen.findByText('Older')).toBeInTheDocument()
    expect(fetchPlayHistory).toHaveBeenLastCalledWith('cursor-1')
    expect(rows()).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })
})

describe('fetchPlayHistory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for the first page, then for runs before the cursor', async () => {
    const { fetchPlayHistory: realFetch } =
      await vi.importActual<typeof import('@/lib/runs/history')>('@/lib/runs/history')
    const fetchMock = stubApi({ '/history': { body: { entries: [], nextBefore: null } } })

    await realFetch()
    await realFetch('2026-09-04T16:00:00+00:00')

    const [first, second] = callsTo(fetchMock, '/history')
    expect(first.has('before')).toBe(false)
    expect(second.get('before')).toBe('2026-09-04T16:00:00+00:00')
  })
})
