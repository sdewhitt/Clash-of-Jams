/** User story #73: the sign-up page warns about a profane username instead of submitting. */
import { fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithAuth } from '@/test/render'

vi.mock('@/lib/auth/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/account')>()),
  signUp: vi.fn(async () => ({})),
}))

const { signUp } = await import('@/lib/auth/account')
const { SignUp } = await import('@/pages/SignUp')

function fillForm(username: string) {
  fireEvent.change(screen.getByRole('textbox', { name: /^Username/ }), {
    target: { value: username },
  })
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
    target: { value: 'new@example.com' },
  })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter22' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

beforeEach(() => {
  vi.mocked(signUp).mockClear()
})

describe('SignUp', () => {
  it('shows a warning and does not create the account for a profane username', () => {
    renderWithAuth(<SignUp />)
    fillForm('sh1t_head')

    expect(screen.getByRole('alertdialog')).toHaveTextContent(/sh1t_head can't be used/)
    expect(signUp).not.toHaveBeenCalled()
  })

  it('keeps the other fields after the warning is closed', () => {
    renderWithAuth(<SignUp />)
    fillForm('sh1t_head')
    fireEvent.click(screen.getByRole('button', { name: 'Change username' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('new@example.com')
    expect(screen.getByLabelText('Password')).toHaveValue('hunter22')
    expect(screen.getByRole('textbox', { name: /^Username/ })).toHaveValue('sh1t_head')
  })

  it('submits a clean username', () => {
    renderWithAuth(<SignUp />)
    fillForm('classic_rock')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(signUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'hunter22',
      username: 'classic_rock',
    })
  })
})
