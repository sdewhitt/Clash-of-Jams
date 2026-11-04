/**
 * User story #35: the "My Scores" panel on a scenario's preview, against stubbed API responses.
 */
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ScoreHistoryPanel } from '@/components/ScoreHistoryPanel'
import type { ScenarioAttempt, ScenarioScoreHistory } from '@/lib/runs/history'
import { callsTo, stubApi } from '@/test/api'
import { renderWithAuth, signedIn } from '@/test/render'

const PATH = '/history/scenarios/scn'

function attempt(overrides: Partial<ScenarioAttempt> = {}): ScenarioAttempt {
  return {
    runId: 'r1',
    scenarioVersionId: 'v1',
    instrument: 'piano',
    finalScore: 80_000,
    playedAt: '2026-09-20T16:00:00Z',
    validation: 'accepted',
    matchId: null,
    breakdown: {
      pitchAccuracy: 80,
      rhythmAccuracy: 70,
      completeness: 90,
      notesHit: 9,
      notesMissed: 1,
      extraNotes: 2,
    },
    ...overrides,
  }
}

function history(overrides: Partial<ScenarioScoreHistory> = {}): ScenarioScoreHistory {
  return { scenarioId: 'scn', stats: null, attempts: [], ...overrides }
}

function renderPanel(response: { status?: number; body: unknown }) {
  const fetchMock = stubApi({ [PATH]: response })
  renderWithAuth(<ScoreHistoryPanel scenarioId="scn" />, { auth: signedIn() })
  return fetchMock
}

/** The value shown under a summary label, e.g. stat('Best'). */
function stat(label: string) {
  const term = within(screen.getByLabelText('Score summary')).getByText(label)
  return term.nextElementSibling?.textContent
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ScoreHistoryPanel API responses', () => {
  it('shows an error when the API returns 404', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderPanel({ status: 404, body: { detail: 'Scenario not found' } })

    expect(await screen.findByText("Couldn't load your scores.")).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says "No attempts yet" when the API returns 200 with no attempts', async () => {
    renderPanel({ body: history() })

    expect(await screen.findByText('No attempts yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the summary and one row per attempt when the API returns 200 with rows', async () => {
    renderPanel({
      body: history({
        stats: {
          attemptCount: 3,
          bestScore: 90_000,
          averageScore: 76_666.67,
          mostRecentScore: 80_000,
          firstScore: 60_000,
          improvement: 20_000,
        },
        attempts: [
          attempt({ runId: 'r3', finalScore: 80_000 }),
          attempt({ runId: 'r2', finalScore: 90_000 }),
          attempt({ runId: 'r1', finalScore: 60_000 }),
        ],
      }),
    })

    await screen.findByRole('table')
    expect(stat('Best')).toBe((90_000).toLocaleString())
    expect(stat('Average')).toBe((76_666.67).toLocaleString())
    expect(stat('Latest')).toBe((80_000).toLocaleString())
    expect(stat('Attempts')).toBe('3')
    expect(stat('Improvement')).toBe(`+${(20_000).toLocaleString()}`)
    // One header row, then the attempts in the order the API sent them.
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getAllByRole('cell')[2].textContent)).toEqual([
      (80_000).toLocaleString(),
      (90_000).toLocaleString(),
      (60_000).toLocaleString(),
    ])
  })
})

describe('ScoreHistoryPanel', () => {
  it('shows no improvement for a single attempt', async () => {
    renderPanel({
      body: history({
        stats: {
          attemptCount: 1,
          bestScore: 55_000,
          averageScore: 55_000,
          mostRecentScore: 55_000,
          firstScore: 55_000,
          improvement: null,
        },
        attempts: [attempt({ finalScore: 55_000 })],
      }),
    })

    await screen.findByRole('table')
    expect(stat('Improvement')).toBe('—')
    expect(stat('Attempts')).toBe('1')
  })

  it('marks rejected attempts as not counted', async () => {
    renderPanel({ body: history({ attempts: [attempt({ validation: 'rejected' })] }) })

    expect(await screen.findByText('(not counted)')).toBeInTheDocument()
    expect(screen.getByText('None of your attempts have counted yet.')).toBeInTheDocument()
  })

  it('asks the API for each sort and direction the user picks', async () => {
    const fetchMock = renderPanel({ body: history({ attempts: [attempt()] }) })

    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Newest first' }))
    await userEvent.selectOptions(screen.getByLabelText('Sort by'), 'score')
    await userEvent.click(await screen.findByRole('button', { name: 'Lowest first' }))

    expect(
      callsTo(fetchMock, PATH).map((params) => `${params.get('sort')}:${params.get('order')}`),
    ).toEqual(['date:desc', 'date:asc', 'score:asc', 'score:desc'])
    expect(screen.getByRole('button', { name: 'Highest first' })).toBeInTheDocument()
  })
})

describe('ScoreHistoryPanel attempt details', () => {
  const attempts = [
    attempt({ runId: 'r2', finalScore: 90_000 }),
    attempt({
      runId: 'r1',
      finalScore: 60_000,
      instrument: 'guitar',
      breakdown: {
        pitchAccuracy: 91.5,
        rhythmAccuracy: 72.5,
        completeness: 100,
        notesHit: 7,
        notesMissed: 3,
        extraNotes: 4,
      },
    }),
  ]

  async function openSecondAttempt() {
    await screen.findByRole('table')
    const rows = screen.getAllByRole('row').slice(1)
    await userEvent.click(within(rows[1]).getByRole('button', { name: 'Details' }))
    return screen.getByRole('region', { name: 'Attempt details' })
  }

  /** The value shown with a label inside the detail view, e.g. detail(view, 'Pitch'). */
  function detail(view: HTMLElement, label: string) {
    return within(view).getByText(label).nextElementSibling?.textContent
  }

  it("opens an attempt to show its pitch, rhythm and completeness subscores", async () => {
    renderPanel({ body: history({ attempts }) })

    const view = await openSecondAttempt()

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(view).toHaveTextContent((60_000).toLocaleString())
    expect(view).toHaveTextContent('guitar')
    expect(detail(view, 'Pitch')).toBe('91.5%')
    expect(detail(view, 'Rhythm')).toBe('72.5%')
    expect(detail(view, 'Completeness')).toBe('100%')
    expect(detail(view, 'Notes hit')).toBe('7')
    expect(detail(view, 'Notes missed')).toBe('3')
    expect(detail(view, 'Extra notes')).toBe('4')
  })

  it('goes back to the table of attempts', async () => {
    renderPanel({ body: history({ attempts }) })

    const view = await openSecondAttempt()
    await userEvent.click(within(view).getByRole('button', { name: '← All attempts' }))

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Attempt details' })).not.toBeInTheDocument()
  })

  it("explains that a rejected attempt doesn't count", async () => {
    renderPanel({ body: history({ attempts: [attempts[0], { ...attempts[1], validation: 'rejected' }] }) })

    const view = await openSecondAttempt()

    expect(view).toHaveTextContent("doesn't count toward your stats")
  })
})

