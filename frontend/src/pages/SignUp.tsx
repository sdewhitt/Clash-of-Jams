import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'

import { Button } from '@/components/ui/Button'

export function SignUp() {
  const navigate = useNavigate()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // TODO: swap for Firebase Auth createUserWithEmailAndPassword.
    navigate('/home')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1 mb-8 text-sm text-muted">Scores and ELO start tracking immediately.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Username</span>
            <input
              name="username"
              required
              className="rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-faint"
              placeholder="perfect_fifth"
            />
          </label>

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
              autoComplete="new-password"
              className="rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-faint"
              placeholder="At least 8 characters"
            />
          </label>

          <Button type="submit" size="lg" className="mt-2">
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          Already registered?{' '}
          <Link to="/login" className="text-accent-soft underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
