/**
 * User story #15: how the scenario search page handles what the API sends back,
 * then searching and sorting what it got.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ScenarioSearch } from '@/pages/ScenarioSearch'
import { stubApi } from '@/test/api'
import { renderWithAuth, signedIn } from '@/test/render'

const FILTER_BOUNDS = {
  minPlays: 0,
  maxPlays: 10,
  minRating: 0,
  maxRating: 5,
  minDifficulty: 1,
  maxDifficulty: 10,
}

function scenario(id: string, title: string, authorName: string) {
  return {
    authorName,
    scenario: {
      id,
      authorUid: `uid-${authorName}`,
      title,
      description: '',
      instrument: 'piano',
      genres: [],
      visibility: 'public',
      tags: [],
      authorDifficulty: 3,
      crowdDifficulty: null,
      avgRating: null,
      ratingCount: 0,
      playCount: 1,
      currentVersionId: null,
      currentVersionNumber: 0,
      createdAt: '2026-09-01T00:00:00Z',
      updatedAt: '2026-09-01T00:00:00Z',
    },
  }
}

const SCENARIOS = [
  scenario('b', 'BBBBB', 'audiolab_test_0930'),
  scenario('c', 'CCCCC', 'TestUser'),
  scenario('a', 'AAAAA', 'TestUser'),
]

function renderSearch(scenarios: { status?: number; body: unknown }) {
  stubApi({
    '/scenarios/scenario_with_author': scenarios,
    '/scenarios/filter_items': { body: FILTER_BOUNDS },
  })
  renderWithAuth(<ScenarioSearch />, { auth: signedIn() })
}

/** Scenario titles in the order the list shows them. */
function listedTitles() {
  return screen.getAllByText(/^[A-Z]{5}$/).map((title) => title.textContent)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ScenarioSearch API responses', () => {
  it('shows an error, not an empty search, when the API returns 404', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderSearch({ status: 404, body: { detail: 'Not Found' } })

    expect(await screen.findByText("Couldn't load scenarios.")).toBeInTheDocument()
    expect(screen.queryByText('No scenarios match these filters.')).not.toBeInTheDocument()
  })

  it('says nothing matches when the API returns 200 with no scenarios', async () => {
    renderSearch({ body: [] })

    expect(await screen.findByText('No scenarios match these filters.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument()
  })

  it('lists every scenario when the API returns 200 with rows', async () => {
    renderSearch({ body: SCENARIOS })

    expect(await screen.findByText('AAAAA')).toBeInTheDocument()
    expect(listedTitles()).toEqual(['AAAAA', 'BBBBB', 'CCCCC'])
    expect(screen.getAllByRole('button', { name: 'Select' })).toHaveLength(3)
    expect(screen.queryByText('No scenarios match these filters.')).not.toBeInTheDocument()
  })
})

describe('ScenarioSearch search and sort', () => {
  it('searches by scenario name and by creator name', async () => {
    renderSearch({ body: SCENARIOS })
    await screen.findByText('AAAAA')
    const search = screen.getByPlaceholderText('Search Scenarios')

    await userEvent.type(search, 'BBBBB')
    expect(listedTitles()).toEqual(['BBBBB'])

    await userEvent.clear(search)
    await userEvent.type(search, 'testuser')
    expect(listedTitles()).toEqual(['AAAAA', 'CCCCC'])
  })

  it('sorts by name ascending, then descending', async () => {
    renderSearch({ body: SCENARIOS })
    await screen.findByText('AAAAA')

    expect(listedTitles()).toEqual(['AAAAA', 'BBBBB', 'CCCCC'])
    await userEvent.click(screen.getByRole('button', { name: 'Sort ascending' }))
    expect(listedTitles()).toEqual(['CCCCC', 'BBBBB', 'AAAAA'])
  })
})
