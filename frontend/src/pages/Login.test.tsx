/**
 * User story #67: signing in with Google from the login page.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { signInWithGoogle } from '@/lib/auth/account'
import { Login } from '@/pages/Login'
import { renderAtRoute, signedIn, SIGNED_OUT } from '@/test/render'

vi.mock('@/lib/auth/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/account')>()),
  signInWithGoogle: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(signInWithGoogle).mockReset()
})

describe('Login with Google', () => {
  it('signs in and continues to the home page', async () => {
    vi.mocked(signInWithGoogle).mockResolvedValue({ uid: 'ada' } as User)
    renderAtRoute(<Login />, { path: '/login', auth: SIGNED_OUT })

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))

    // Navigation follows the sign-in promise, so wait for it.
    expect(await screen.findByTestId('location')).toHaveTextContent('/home')
    expect(signInWithGoogle).toHaveBeenCalledOnce()
  })

  it('stays on the page with a readable error when sign-in fails', async () => {
    vi.mocked(signInWithGoogle).mockRejectedValue(
      Object.assign(new Error('closed'), { code: 'auth/popup-closed-by-user' }),
    )
    renderAtRoute(<Login />, { path: '/login', auth: SIGNED_OUT })

    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))

    expect(
      await screen.findByText('The sign-in window was closed before finishing.'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('location')).not.toBeInTheDocument()
  })

  it('sends an already signed-in user straight on', () => {
    renderAtRoute(<Login />, { path: '/login', auth: signedIn() })

    expect(screen.getByTestId('location')).toHaveTextContent('/home')
  })
})
