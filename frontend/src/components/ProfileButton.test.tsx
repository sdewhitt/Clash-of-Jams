/**
 * User story #67: signing out from the profile menu.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ProfileButton } from '@/components/ProfileButton'
import { signOutCurrentUser } from '@/lib/auth/account'
import { renderAtRoute, signedIn } from '@/test/render'

vi.mock('@/lib/auth/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/account')>()),
  signOutCurrentUser: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(signOutCurrentUser).mockReset().mockResolvedValue()
})

describe('ProfileButton sign out', () => {
  it('ends the session and returns to the sign-in page', async () => {
    renderAtRoute(<ProfileButton username="Player One" userAvatar="avatar.png" />, {
      path: '/home',
      auth: signedIn(),
    })

    await userEvent.click(screen.getByRole('button', { name: 'Open User Profile Menu' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sign Out' }))

    expect(signOutCurrentUser).toHaveBeenCalledOnce()
    expect(await screen.findByTestId('location')).toHaveTextContent('/login')
  })

  it('keeps Sign Out out of the way until the menu is opened', () => {
    renderAtRoute(<ProfileButton username="Player One" userAvatar="avatar.png" />, {
      path: '/home',
      auth: signedIn(),
    })

    expect(screen.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument()
    expect(signOutCurrentUser).not.toHaveBeenCalled()
  })
})
