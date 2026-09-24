import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { authErrorMessage, sendResetEmail, signIn } from '@/lib/auth/account'
import { useAuth } from '@/lib/auth/useAuth'

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Where RequireAuth bounced the user from, if anywhere.
  const from = (location.state as { from?: string } | null)?.from ?? '/home'

  if (loading) return null
  if (user) return <Navigate to={from} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      await signIn(email, password)
      navigate(from, { replace: true })
    } catch (caught) {
      setError(authErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  async function handleReset() {
    setError(null)
    setNotice(null)
    if (!email) {
      setError('Enter your email address first.')
      return
    }
    try {
      await sendResetEmail(email)
      setNotice('Password reset email sent.')
    } catch (caught) {
      setError(authErrorMessage(caught))
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight">Clash of Jams</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-faint"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-faint"
            />
          </label>

          {error && <p className="text-sm text-accent-soft">{error}</p>}
          {notice && <p className="text-sm text-muted">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-soft disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link
            to="/signup"
            className="text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Create an account
          </Link>
          <button
            type="button"
            onClick={handleReset}
            className="text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            Forgot password?
          </button>
        </div>
      </div>
    </div>
  )
}
