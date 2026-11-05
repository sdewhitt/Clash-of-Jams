import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import { saveProfileAppearance } from '@/lib/profile/profileAppearance'
import { fetchPlayHistory } from '@/lib/runs/history'
import { ProfileAppearanceEditor } from './ProfileAppearanceEditor'

vi.mock('@/lib/profile/profileAppearance', () => ({
  DEFAULT_APPEARANCE: { accent: 'Default', featuredScores: [] },
  PROFILE_ACCENTS: { Default: 'black', Blue: 'blue' },
  publishedScenarioTitles: vi.fn(async (ids: string[]) =>
    new Map(ids.filter((id) => id === 'public').map((id) => [id, 'Public scenario']))),
  saveProfileAppearance: vi.fn(),
}))

vi.mock('@/lib/profile/userSettings', () => ({
  getUserSettings: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/profile/publicProfile', () => ({
  getPublicProfile: vi.fn().mockResolvedValue({ displayName: 'Player', publicHistory: false }),
}))

vi.mock('@/lib/runs/history', () => ({ fetchPlayHistory: vi.fn() }))

it('saves eligible scores and excludes them from a visitor preview when history is private', async () => {
  vi.mocked(fetchPlayHistory).mockResolvedValue({
    entries: ['public', 'private'].map((scenarioId) => ({
      runId: `${scenarioId}-run`,
      scenarioId,
      scenarioVersionId: 'v1',
      scenarioTitle: `${scenarioId} scenario`,
      instrument: 'piano',
      finalScore: 900,
      playedAt: '2026-11-04T00:00:00Z',
      validation: 'accepted',
      matchId: null,
      scenarioAvailable: true,
      isCurrentVersion: true,
    })),
    nextBefore: null,
  })
  vi.mocked(saveProfileAppearance).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce()
  const user = userEvent.setup()
  render(<ProfileAppearanceEditor uid="player" />)

  await user.selectOptions(await screen.findByLabelText('Profile accent'), 'Blue')
  await user.click(screen.getByRole('button', { name: 'Load play history' }))
  const score = await screen.findByRole('checkbox', { name: /Public scenario/ })
  expect(screen.queryByRole('checkbox', { name: /private scenario/i })).toBeNull()
  await user.click(score)
  await user.click(screen.getByRole('button', { name: 'Preview as Visitor' }))
  expect(screen.getByRole('heading', { name: 'Player' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Featured scores' })).toBeNull()

  const save = screen.getByRole('button', { name: 'Save Changes' })
  await user.click(save)
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
  expect(score).toBeChecked()
  await user.click(save)
  expect(await screen.findByText('Profile appearance saved.')).toBeInTheDocument()
  expect(saveProfileAppearance).toHaveBeenLastCalledWith('player', {
    accent: 'Blue',
    featuredScores: [{ runId: 'public-run', scenarioId: 'public', finalScore: 900 }],
  })
})
