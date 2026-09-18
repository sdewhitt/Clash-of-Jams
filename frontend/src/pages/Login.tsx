import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'

export function Login() {
  const navigate = useNavigate()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // No auth yet — this just moves to the home route.
    navigate('/home')
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
              className="rounded-lg border border-line bg-surface px-3 py-2 text-ink placeholder:text-faint"
            />
          </label>

          <button
            type="submit"
            className="mt-2 rounded-lg bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-soft"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}
