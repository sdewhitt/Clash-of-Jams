import { useNavigate } from 'react-router'

import { BackButton } from '@/components/BackButton'
import { LiveElo } from '@/components/LiveElo'
import { ProfileButton } from '@/components/ProfileButton'
import { useAuth } from '@/lib/auth/useAuth'
import { useMatchmaking } from '@/lib/matchmaking/useMatchmaking'

export function MultiplayerConnect() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { status, error, leaving, cancel, retry } = useMatchmaking(user?.uid)
  const match = status?.match
  const opponent = match?.participants.find((participant) => participant.uid !== user?.uid)

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
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-accent-start bg-linear-to-r from-accent-base-start via-accent-base-middle to-accent-base-end px-4 py-5 sm:px-12">
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
          aria-label={match ? 'Matched opponent' : 'Matchmaking queue'}
          data-match-id={match?.id}
          data-scenario-version={match?.scenarioVersionId}
          className="flex min-w-0 w-full max-w-lg flex-col items-center gap-6 rounded-xl border-3 border-accent-start bg-linear-to-br from-accent-base-start via-accent-base-middle to-accent-base-end p-6 text-center text-ink wrap-anywhere sm:p-10"
        >
          {match && opponent ? (
            <>
              <h2 className="text-2xl font-bold">Opponent found</h2>
              <p className="text-xl">
                {opponent.displayName} · {Math.round(opponent.elo)} Elo
              </p>
              <div className="w-full rounded-lg border-2 border-accent-start p-4">
                <p className="mb-2 text-sm text-ink/80">Shared scenario · {match.instrument}</p>
                <h3 className="text-xl font-bold">{match.scenarioTitle}</h3>
                <p className="mt-2 text-sm text-ink/80">
                  Difficulty {match.scenarioDifficulty}/10
                  {match.difficultySource === 'author' ? ' · Provisional' : ''}
                </p>
              </div>
              <p role="status">Waiting for the match to begin.</p>
            </>
          ) : (
            <p role="status" className="text-xl font-bold">
              Finding a suitable opponent…
            </p>
          )}
          {error && (
            <div className="flex flex-col gap-3">
              <p role="alert">{error}</p>
              <button type="button" onClick={retry} disabled={leaving} className="underline">
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
            className="rounded-lg border-2 border-accent-start bg-white px-6 py-3 font-bold text-black disabled:opacity-50"
          >
            {leaving ? 'Leaving…' : match ? 'Leave lobby' : 'Cancel'}
          </button>
        </section>
      </div>
    </main>
  )
}
