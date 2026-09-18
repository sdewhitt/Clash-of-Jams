import { Link } from 'react-router'

export function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-sm text-faint">404</p>
      <h1 className="text-2xl font-semibold">That page is off-beat.</h1>
      <Link to="/home" className="text-accent-soft underline-offset-4 hover:underline">
        Back to home
      </Link>
    </div>
  )
}
