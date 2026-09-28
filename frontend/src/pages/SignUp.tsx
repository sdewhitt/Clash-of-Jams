import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'

import { USERNAME_PATTERN, authErrorMessage, signUp } from '@/lib/auth/account'
import { useAuth } from '@/lib/auth/useAuth'

const FIELD_CLASS =
  'rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-faint'

export function SignUp() {
  const navigate = useNavigate()
  const { user, loading } = useAuth()

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return null
  if (user) return <Navigate to="/home" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signUp({ email, password, username })
      navigate('/home', { replace: true })
    } catch (caught) {
      setError(authErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-2xl font-semibold tracking-tight">Create your account</h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Username</span>
            <input
              type="text"
              name="username"
              required
              minLength={3}
              maxLength={20}
              pattern={USERNAME_PATTERN.source.slice(1, -1)}
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={FIELD_CLASS}
            />
            <span className="text-xs text-faint">
              3-20 characters: letters, numbers and underscores. This is permanent for now.
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Password</span>
            <input
              type="password"
              name="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={FIELD_CLASS}
            />
          </label>

          {error && <p className="text-sm text-accent-soft">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-soft disabled:opacity-60"
          >
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted">
          Already have an account?{' '}
          <Link to="/login" className="underline-offset-4 hover:text-ink hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
