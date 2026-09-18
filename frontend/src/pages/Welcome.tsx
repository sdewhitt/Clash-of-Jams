import { Link } from 'react-router'

export function Welcome() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="mb-4 text-xs font-medium tracking-[0.2em] text-faint uppercase">
        Deliberate practice, scored
      </p>

      <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
        Clash <span className="text-accent">of</span> Jams
      </h1>

      <p className="mt-5 max-w-lg text-muted">
        Play real scenarios on a real instrument. Get pitch and rhythm scored in real time, then
        climb the leaderboard against your past self and everyone else.
      </p>

      <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/signup"
          className="rounded-lg bg-accent px-6 py-3 font-medium text-white transition-colors hover:bg-accent-soft"
        >
          Create an account
        </Link>
        <Link
          to="/login"
          className="rounded-lg border border-line bg-surface-2 px-6 py-3 font-medium transition-colors hover:border-accent/60"
        >
          Sign in
        </Link>
      </div>

      <Link to="/home" className="mt-8 text-sm text-faint underline-offset-4 hover:underline">
        Skip for now &rarr;
      </Link>
    </div>
  )
}
