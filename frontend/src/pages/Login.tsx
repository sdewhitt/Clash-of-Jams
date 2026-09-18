import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { Button } from '@/components/ui/Button'

export function Login() {
  const navigate = useNavigate()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // TODO: swap for Firebase Auth signInWithEmailAndPassword.
    navigate('/home')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1 mb-8 text-sm text-muted">Sign in to keep your streak going.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-faint"
              placeholder="you@example.com"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Password</span>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-faint"
              placeholder="••••••••"
            />
          </label>

          <Button type="submit" size="lg" className="mt-2">
            Sign in
          </Button>
        </form>

        <Button variant="secondary" size="lg" className="mt-3 w-full" disabled>
          Continue with Google
        </Button>

        <p className="mt-6 text-center text-sm text-muted">
          No account?{' '}
          <Link to="/signup" className="text-accent-soft underline-offset-4 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
