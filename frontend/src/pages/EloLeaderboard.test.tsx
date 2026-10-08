/**
 * User story #22: how the global ELO leaderboard handles what the API sends back.
 */
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EloLeaderboard } from '@/pages/EloLeaderboard'
import { callsTo, stubApi } from '@/test/api'
import { board, entry } from '@/test/leaderboards'
import { renderWithAuth, signedIn } from '@/test/render'

const PATH = '/leaderboards/elo'

function renderBoard(response: { status?: number; body: unknown }) {
  const fetchMock = stubApi({ [PATH]: response })
  renderWithAuth(<EloLeaderboard />, { auth: signedIn({ uid: 'me' }) })
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EloLeaderboard API responses', () => {
  it('shows an error when the API returns 404', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderBoard({ status: 404, body: { detail: 'Not Found' } })

    expect(await screen.findByText("Couldn't load the leaderboard.")).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('says nobody is ranked yet when the API returns 200 with no rows', async () => {
    renderBoard({ body: board() })

    expect(await screen.findByText(/No ranked/)).toHaveTextContent('No ranked piano players yet.')
    expect(screen.getByText('Play an online piano match to get ranked.')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('shows the rows sorted by ELO, ties sharing a rank', async () => {
    const entries = [
      entry('a', 1, 2412),
      entry('b', 2, 2368),
      entry('c', 2, 2368),
      entry('d', 4, 2340),
    ]
    renderBoard({ body: board({ entries }) })

    const rows = await screen.findAllByRole('listitem')
    expect(rows.map((row) => within(row).getByText(/^#\d+$/).textContent)).toEqual([
      '#1',
      '#2',
      '#2',
      '#4',
    ])
    expect(within(rows[1]).getByText('2368')).toBeInTheDocument()
    expect(screen.getByText('4 ranked players')).toBeInTheDocument()
  })

  it('highlights the caller in the list when they are in the top 100', async () => {
    const mine = entry('me', 2, 1460)
    renderBoard({
      body: board({ entries: [entry('a', 1, 1900), mine], myEntry: mine, percentile: 1 }),
    })

    const rows = await screen.findAllByRole('listitem')
    expect(rows[1]).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByText(/^You're/)).not.toBeInTheDocument()
  })

  it("shows the caller's rank and percentile when they are outside the top 100", async () => {
    const top100 = Array.from({ length: 100 }, (_, i) => entry(`p${i}`, i + 1, 2400 - i))
    const mine = entry('me', 109, 1180)
    renderBoard({
      body: board({ entries: top100, myEntry: mine, totalPlayers: 155, percentile: 109 / 155 }),
    })

    expect(await screen.findByText('#109')).toBeInTheDocument()
    expect(screen.getByText(/of 155/)).toBeInTheDocument()
    expect(screen.getByText('Top 71%')).toBeInTheDocument()
  })

  it('asks the API for the instrument the user picks', async () => {
    const fetchMock = renderBoard({ body: board() })
    await screen.findByText(/No ranked/)

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Instrument' }), 'vocals')

    expect(
      await screen.findByText('Play an online vocals match to get ranked.'),
    ).toBeInTheDocument()
    expect(callsTo(fetchMock, PATH).map((query) => query.get('instrument'))).toEqual([
      'piano',
      'vocals',
    ])
  })
})
