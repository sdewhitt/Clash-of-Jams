import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LocationProbe, renderWithAuth, signedIn } from '@/test/render'
import examplesFixture from '@/test/difficulty-examples.json'
import type { DifficultyDetail } from '@/lib/difficulty/types'
import { ScenarioDifficulty } from './ScenarioDifficulty'

const api = vi.hoisted(() => ({
  loadExamples: vi.fn(),
  loadDifficultyScenarios: vi.fn(),
  loadDifficulty: vi.fn(),
  publishDifficulty: vi.fn(),
}))
vi.mock('@/lib/difficulty/api', () => api)
const examples = examplesFixture as DifficultyDetail[]

function show(route = '/scenario_difficulty') {
  return renderWithAuth(
    <>
      <ScenarioDifficulty />
      <LocationProbe />
    </>,
    { auth: signedIn(), route },
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  api.loadExamples.mockResolvedValue(examples)
  api.loadDifficultyScenarios.mockResolvedValue([])
})

describe('scenario difficulty explorer', () => {
  it('shows synthetic evidence, keyboard tabs and URL selection', async () => {
    const user = userEvent.setup()
    show()
    const first = await screen.findByRole('tab', { name: 'Gentle warm-up' })
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('img', { name: 'Average normalized score by player Elo band' }),
    ).toBeVisible()
    expect(screen.getByText('Synthetic example')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Recompute and save estimate' }),
    ).not.toBeInTheDocument()
    first.focus()
    await user.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('heading', { name: 'Fast passage', level: 2 })).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Fast passage' })).toHaveFocus()
    expect(screen.getByTestId('location')).toHaveTextContent('scenario=fast-passage')
    expect(screen.getByText('Hard', { exact: true })).toBeVisible()
  })

  it('explains bands, a continuous rating illustration, and capped repeat evidence', async () => {
    const user = userEvent.setup()
    show()
    await screen.findByRole('heading', { name: 'Gentle warm-up', level: 2 })
    await user.click(screen.getByRole('button', { name: /Below 800 Elo/ }))
    expect(screen.getByText(/Below 800 Elo contributes 36 independent players/)).toBeVisible()
    const slider = screen.getByRole('slider', { name: /Player Elo/ })
    const original = screen.getByText(/Illustrative score at this rating/).textContent
    fireEvent.change(slider, { target: { value: '2000' } })
    expect(screen.getByText(/Illustrative score at this rating/).textContent).not.toBe(original)
    await user.click(screen.getByRole('tab', { name: 'Repeated attempts' }))
    expect(screen.getByText('Provisional', { exact: true })).toBeVisible()
    expect(screen.getByText('97 repeat attempts excluded by the per-player cap.')).toBeVisible()
    expect(screen.getByRole('slider', { name: /Player Elo/ })).toHaveValue('1100')
  })

  it('retries catalog failures and renders an empty library', async () => {
    const user = userEvent.setup()
    api.loadExamples.mockRejectedValueOnce(new Error('Network unavailable'))
    show()
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('tab', { name: 'Gentle warm-up' })
    await user.click(screen.getByRole('button', { name: 'Scenario library' }))
    expect(await screen.findByText(/No scenarios available/)).toBeVisible()
  })

  it('loads actual evidence and only saves a server-computed estimate for an author', async () => {
    const user = userEvent.setup()
    const detail = { ...examples[3], source: 'performances' as const, canPublish: true }
    api.loadDifficultyScenarios.mockResolvedValue([detail.scenario])
    api.loadDifficulty.mockResolvedValue(detail)
    api.publishDifficulty.mockResolvedValue({ ...detail, publishedAt: '2026-10-08T12:00:00Z' })
    show('/scenario_difficulty?source=library')
    const publish = await screen.findByRole('button', { name: 'Recompute and save estimate' })
    expect(screen.getByText('Performance evidence')).toBeVisible()
    await user.click(publish)
    expect(api.publishDifficulty).toHaveBeenCalledWith(detail.scenario.id)
    expect(await screen.findByText(/Provisional estimate saved/)).toBeVisible()
  })

  it('displays publication errors and permits a retry', async () => {
    const user = userEvent.setup()
    const detail = { ...examples[0], source: 'performances' as const, canPublish: true }
    api.loadDifficultyScenarios.mockResolvedValue([detail.scenario])
    api.loadDifficulty.mockResolvedValue(detail)
    api.publishDifficulty.mockRejectedValueOnce(
      new Error('Scenario changed. Refresh and recompute.'),
    )
    show('/scenario_difficulty?source=library')
    await user.click(await screen.findByRole('button', { name: 'Recompute and save estimate' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Scenario changed')
    expect(screen.getByRole('button', { name: 'Recompute and save estimate' })).toBeEnabled()
  })

  it('does not let a late response replace the newly selected scenario', async () => {
    const user = userEvent.setup()
    let resolveOld!: (detail: DifficultyDetail) => void
    api.loadDifficultyScenarios.mockResolvedValue(examples.slice(0, 2).map((row) => row.scenario))
    api.loadDifficulty.mockImplementation((id: string) =>
      id === examples[0].scenario.id
        ? new Promise<DifficultyDetail>((resolve) => {
            resolveOld = resolve
          })
        : Promise.resolve({ ...examples[1], source: 'performances', canPublish: false }),
    )
    show('/scenario_difficulty?source=library')
    await user.click(await screen.findByRole('tab', { name: 'Steady groove' }))
    await screen.findByRole('heading', { name: 'Steady groove', level: 2 })
    await act(async () => resolveOld(examples[0]))
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Steady groove', level: 2 })).toBeVisible(),
    )
    expect(
      screen.queryByRole('heading', { name: 'Gentle warm-up', level: 2 }),
    ).not.toBeInTheDocument()
  })
})
