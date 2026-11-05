import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

import { apiFetch } from '@/lib/api'
import { renderAtRoute } from '@/test/render'
import { SpectateTab } from './SpectateTab'

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }))

it('checks for live friend matches before the tab opens and offers a Join link', async () => {
  vi.mocked(apiFetch).mockResolvedValue([{ id: 'match-1', friends: ['Friend One'] }])
  renderAtRoute(<SpectateTab uid="viewer" />, { path: '/', route: '/' })

  const tab = await screen.findByRole('button', { name: 'Spectate (1)' })
  expect(apiFetch).toHaveBeenCalledWith('/multiplayer/spectating', expect.anything())
  expect(screen.queryByRole('link', { name: 'Join' })).not.toBeInTheDocument()
  await userEvent.click(tab)
  expect(screen.getByText('Friend One')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Join' })).toHaveAttribute('href', '/spectate/match-1')
})
