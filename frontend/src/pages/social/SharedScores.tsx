/** Results friends have sent you from their results screens (user story #37). */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { BackButton } from '@/components/BackButton'
import { ProfileButton } from '@/components/ProfileButton'
import { useAuth } from '@/lib/auth/useAuth'
import { listScoresSharedWithMe, type SharedScore } from '@/lib/scores/share'

type Load = { kind: 'loading' } | { kind: 'loaded'; scores: SharedScore[] } | { kind: 'error' }

export function SharedScores() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })

  useEffect(() => {
    if (!user) return
    let cancelled = false
    listScoresSharedWithMe(user.uid)
      .then((scores) => !cancelled && setLoad({ kind: 'loaded', scores }))
      .catch(() => !cancelled && setLoad({ kind: 'error' }))
    return () => {
      cancelled = true
    }
  }, [user])

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <header
        className="flex items-center justify-between border-b-4 border-accent-start
          bg-linear-to-r from-accent-base-start from-10% via-accent-base-middle via-70%
          to-accent-base-end to-90% py-6"
      >
        <div className="ml-12 flex">
          <BackButton onClick={() => navigate('/friends/my_friends')} />
          <h1 className="ml-4 text-4xl font-bold text-ink">Shared With You</h1>
        </div>
        <div className="mr-6">
          <ProfileButton
            username={profile?.displayName ?? user?.email ?? '…'}
            userAvatar={profile?.avatarUrl ?? '../../favicon.svg'}
          />
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto px-6 py-6 text-ink">
        {load.kind === 'loading' && <p className="text-muted">Loading scores...</p>}
        {load.kind === 'error' && <p className="text-muted">Shared scores could not be loaded.</p>}
        {load.kind === 'loaded' && load.scores.length === 0 && (
          <p className="text-muted">
            Nothing yet. When a friend sends you a score, it will show up here.
          </p>
        )}
        {load.kind === 'loaded' &&
          load.scores.map(({ share, fromName }) => (
            <article
              key={share.id}
              className="flex w-full max-w-xl items-center justify-between gap-4 rounded-xl
                border-3 border-accent-start bg-accent-base-start px-5 py-4"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-sm text-muted">{fromName} scored</p>
                <p className="truncate font-bold">{share.scenarioTitle}</p>
                {share.message && <p className="text-sm">"{share.message}"</p>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-3xl font-bold tabular-nums">
                  {share.finalScore.toLocaleString()}
                </span>
                <Link
                  to={`/play/${share.scenarioId}`}
                  className="text-sm underline-offset-4 hover:underline"
                >
                  Play it
                </Link>
              </div>
            </article>
          ))}
      </div>
    </main>
  )
}
