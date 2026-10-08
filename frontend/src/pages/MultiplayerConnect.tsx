import { useNavigate } from 'react-router'
import { useEffect, useState } from 'react'

import { BackButton } from '@/components/BackButton'
import { LiveElo } from '@/components/LiveElo'
import { ProfileButton } from '@/components/ProfileButton'
import { useAuth } from '@/lib/auth/useAuth'
import { useMatchmaking } from '@/lib/matchmaking/useMatchmaking'

export function MultiplayerConnect() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { status, receivedAt, error, leaving, cancel, retry } = useMatchmaking(user?.uid)
  const match = status?.match
  const [now, setNow] = useState(() => performance.now())
  const queued = status?.state === 'queued'
  const elapsed = queued ? Math.floor(status.waitSeconds + Math.max(0, now - receivedAt) / 1000) : 0

  useEffect(() => {
    if (!queued) return
    const timer = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(timer)
  }, [queued])

  useEffect(() => {
    if (match) navigate('/multiplayer/' + encodeURIComponent(match.id), { replace: true })
  }, [match, navigate])

  async function leave() {
    try {
      await cancel()
      navigate('/home')
    } catch {
      /* The hook displays the error and keeps the page available. */
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="relative flex flex-wrap items-center justify-between gap-4 border-b-4 border-accent-start bg-linear-to-r from-accent-base-start via-accent-base-middle to-accent-base-end px-4 py-5 sm:px-12">
        <div className="flex items-center gap-4">
          <BackButton
            onClick={() => {
              void leave()
            }}
          />
          <h1 className="text-3xl font-bold text-ink">Multiplayer</h1>
        </div>
        <div className="flex items-center gap-3">
          <LiveElo />
          <ProfileButton
            className="w-36 shrink-0 sm:w-50"
            username={profile?.displayName ?? user?.email ?? '…'}
            userAvatar={profile?.avatarUrl ?? '../../favicon.svg'}
          />
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <section
          aria-label="Matchmaking queue"
          className="flex min-w-0 w-full max-w-lg flex-col items-center gap-6 rounded-xl border-3 border-accent-start bg-linear-to-br from-accent-base-start via-accent-base-middle to-accent-base-end p-6 text-center text-ink wrap-anywhere sm:p-10"
        >
          <p role="status" className="text-xl font-bold">
            {match
              ? 'Opening your match…'
              : queued && status.searchExpanded
                ? 'Searching a wider ELO range…'
                : 'Finding a suitable opponent…'}
          </p>
          {queued && (
            <p role="timer" aria-label="Time in queue" className="text-lg tabular-nums">
              Time in queue · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}
            </p>
          )}
          {error && (
            <div className="flex flex-col gap-3">
              <p role="alert">{error}</p>
              <button
                type="button"
                onClick={retry}
                disabled={leaving}
                className="cursor-pointer underline disabled:cursor-not-allowed"
              >
                Try again
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              void leave()
            }}
            disabled={leaving}
            className="cursor-pointer rounded-lg border-2 border-accent-start bg-white px-6 py-3 font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            {leaving ? 'Leaving…' : 'Cancel'}
          </button>
        </section>
      </div>
    </main>
  )
}
