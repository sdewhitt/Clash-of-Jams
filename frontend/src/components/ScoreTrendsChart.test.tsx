/**
 * User story #33: the score trends chart and its filters, against stubbed API responses.
 */
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ScoreTrendsChart } from '@/components/ScoreTrendsChart'
import type { PlayedScenario, ScoreTrendPoint, ScoreTrends } from '@/lib/runs/history'
import { callsTo, stubApi } from '@/test/api'
import { renderWithAuth, signedIn } from '@/test/render'

const PATH = '/history/trends'
const DAY = 24 * 60 * 60 * 1000

function scenario(scenarioId: string, title: string | null = scenarioId): PlayedScenario {
  return { scenarioId, title, lastPlayedAt: '2026-09-20T16:00:00Z' }
}

function point(scenarioId: string, day: string, bestScore: number, attempts = 1): ScoreTrendPoint {
  return { scenarioId, day, bestScore, averageScore: bestScore, attempts }
}

function renderTrends(response: { status?: number; body: unknown }) {
  const fetchMock = stubApi({ [PATH]: response })
  renderWithAuth(<ScoreTrendsChart />, { auth: signedIn() })
  return fetchMock
}

function lastCall(fetchMock: ReturnType<typeof stubApi>) {
  return callsTo(fetchMock, PATH).at(-1) as URLSearchParams
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ScoreTrendsChart API responses', () => {
  it('shows an error when the API returns 404', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderTrends({ status: 404, body: { detail: 'Not Found' } })

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your score trends.")
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('says there is no data when the API returns 200 with no points', async () => {
    renderTrends({ body: { scenarios: [scenario('warmup')], points: [] } satisfies ScoreTrends })

    expect(await screen.findByText('No data for this range')).toBeInTheDocument()
  })

  it('draws one line per scenario when the API returns 200 with rows', async () => {
    renderTrends({
      body: {
        scenarios: [scenario('warmup', 'Warmup'), scenario('scales', 'Scales')],
        points: [
          point('warmup', '2026-09-01', 60_000),
          point('scales', '2026-09-02', 50_000),
          point('warmup', '2026-09-03', 80_000, 3),
        ],
      } satisfies ScoreTrends,
    })

    await screen.findByRole('img')
    expect(screen.getAllByTestId('chart-series')).toHaveLength(2)
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Warmup',
      'Scales',
    ])
  })
})

describe('ScoreTrendsChart', () => {
  it('shows the date, scenario and score of a point, and its attempts', async () => {
    renderTrends({
      body: {
        scenarios: [scenario('warmup', 'Warmup')],
        points: [point('warmup', '2026-09-03', 80_000, 3)],
      } satisfies ScoreTrends,
    })

    // The filters come first in tab order, so focus the chart itself.
    const chart = await screen.findByRole('img')
    act(() => chart.focus())

    const readout = screen.getByRole('status')
    expect(readout).toHaveTextContent(
      new Date(Date.UTC(2026, 8, 3)).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
    )
    expect(readout).toHaveTextContent('Warmup')
    expect(readout).toHaveTextContent((80_000).toLocaleString())
    expect(readout).toHaveTextContent('3 attempts')
  })

  it('keeps a scenario in its own color when the others are filtered out', async () => {
    // Scales is the second scenario played, so it wears slot 2 even when it's the only line.
    renderTrends({
      body: {
        scenarios: [scenario('warmup', 'Warmup'), scenario('scales', 'Scales')],
        points: [point('scales', '2026-09-02', 50_000)],
      } satisfies ScoreTrends,
    })

    await screen.findByRole('img')
    expect(screen.getByTestId('chart-series').querySelector('circle')).toHaveAttribute(
      'fill',
      'var(--chart-series-2)',
    )
  })

  it('draws at most eight scenarios and says how to see the rest', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `s${i}`)
    renderTrends({
      body: {
        scenarios: ids.map((id) => scenario(id)),
        points: ids.map((id) => point(id, '2026-09-01', 50_000)),
      } satisfies ScoreTrends,
    })

    await screen.findByRole('img')
    expect(screen.getAllByTestId('chart-series')).toHaveLength(8)
    expect(screen.getByText(/Pick a scenario above to see the other 2/)).toBeInTheDocument()
  })

  it('lists every played scenario in the scenario filter, unavailable ones included', async () => {
    renderTrends({
      body: { scenarios: [scenario('warmup', 'Warmup'), scenario('gone', null)], points: [] },
    })

    await screen.findByText('No data for this range')
    const options = within(screen.getByLabelText('Scenario')).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      'All scenarios',
      'Warmup',
      'Unavailable scenario',
    ])
  })

  it('sends the scenario, instrument and time range filters to the API', async () => {
    const fetchMock = renderTrends({
      body: { scenarios: [scenario('warmup', 'Warmup')], points: [] },
    })
    await screen.findByText('No data for this range')

    expect(lastCall(fetchMock).has('played_after')).toBe(false)
    expect(lastCall(fetchMock).get('utc_offset_minutes')).toBe(
      String(-new Date().getTimezoneOffset()),
    )

    await userEvent.selectOptions(screen.getByLabelText('Scenario'), 'warmup')
    await userEvent.selectOptions(screen.getByLabelText('Instrument'), 'guitar')
    const before = Date.now()
    await userEvent.selectOptions(screen.getByLabelText('Time range'), '30')

    const params = lastCall(fetchMock)
    expect(params.get('scenario_id')).toBe('warmup')
    expect(params.get('instrument')).toBe('guitar')
    const playedAfter = Date.parse(params.get('played_after') as string)
    expect(Math.abs(before - 30 * DAY - playedAfter)).toBeLessThan(60_000)
  })
})
