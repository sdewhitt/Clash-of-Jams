/**
 * User story #21: how a scenario's leaderboard handles what the API sends back.
 */
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ScenarioLeaderboard } from '@/components/ScenarioLeaderboard'
import { callsTo, stubApi } from '@/test/api'
import { board, entry } from '@/test/leaderboards'
import { renderWithAuth, signedIn } from '@/test/render'

const PATH = '/leaderboards/moonlight/moonlight_v1'

function renderBoard(
  response: { status?: number; body: unknown },
  versionId: string | null = 'moonlight_v1',
) {
  const fetchMock = stubApi({ [PATH]: response })
  renderWithAuth(<ScenarioLeaderboard scenarioId="moonlight" versionId={versionId} />, {
    auth: signedIn({ uid: 'me' }),
  })
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ScenarioLeaderboard API responses', () => {
  it('shows an error when the API returns 404', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderBoard({ status: 404, body: { detail: 'Not Found' } })

    expect(await screen.findByText("Couldn't load the leaderboard.")).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('shows "no scores yet" when the API returns 200 with no rows', async () => {
    renderBoard({ body: board() })

    expect(await screen.findByText('No scores yet.')).toBeInTheDocument()
    expect(screen.getByText('Play this scenario to get on the board.')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('shows the rows in the order the API sends them, ties sharing a rank', async () => {
    const entries = [
      entry('a', 1, 99_150),
      entry('b', 2, 98_700),
      entry('c', 2, 98_700),
      entry('d', 4, 97_850),
    ]
    renderBoard({ body: board({ entries }) })

    const rows = await screen.findAllByRole('listitem')
    expect(rows.map((row) => within(row).getByText(/^#\d+$/).textContent)).toEqual([
      '#1',
      '#2',
      '#2',
      '#4',
    ])
    expect(within(rows[0]).getByText('Player a')).toBeInTheDocument()
    expect(within(rows[0]).getByText((99_150).toLocaleString())).toBeInTheDocument()
  })

  it('highlights the caller when they are in the rows', async () => {
    const mine = entry('me', 2, 98_000)
    renderBoard({
      body: board({ entries: [entry('a', 1, 99_000), mine], myEntry: mine, percentile: 1 }),
    })

    const rows = await screen.findAllByRole('listitem')
    expect(rows[1]).toHaveAttribute('aria-current', 'true')
    expect(within(rows[1]).getByText('(you)')).toBeInTheDocument()
    expect(screen.queryByText(/^You're/)).not.toBeInTheDocument()
  })

  it("shows the caller's rank and percentile when they are outside the top 25", async () => {
    const top25 = Array.from({ length: 25 }, (_, i) => entry(`p${i}`, i + 1, 99_000 - i * 100))
    const mine = entry('me', 31, 84_350)
    renderBoard({
      body: board({ entries: top25, myEntry: mine, totalPlayers: 41, percentile: 31 / 41 }),
    })

    expect(await screen.findByText('#31')).toBeInTheDocument()
    expect(screen.getByText(/of 41/)).toBeInTheDocument()
    expect(screen.getByText('Top 76%')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(25)
  })

  it('shows "no scores yet" without calling the API when there is no version to rank', () => {
    const fetchMock = renderBoard({ body: board() }, null)

    expect(screen.getByText('No scores yet.')).toBeInTheDocument()
    expect(callsTo(fetchMock, PATH)).toHaveLength(0)
  })
})
