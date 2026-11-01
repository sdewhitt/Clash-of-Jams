/**
 * User story #34: every scenario the signed-in user has played, newest first.
 * An entry opens its scenario's preview on the search page, unless the scenario is gone.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { BackButton } from '@/components/BackButton'
import { ProfileButton } from '@/components/ProfileButton'
import { useAuth } from '@/lib/auth/useAuth'
import { fetchPlayHistory, type PlayHistoryEntry } from '@/lib/runs/history'
import { MAX_SCORE } from '@/scoring/score'

const buttonClass =
  'cursor-pointer rounded-lg border-2 border-accent-start px-4 py-2 font-bold active:scale-95 disabled:cursor-not-allowed disabled:opacity-50'

function formatPlayedAt(playedAt: string): string {
  return new Date(playedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function PlayHistory() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [entries, setEntries] = useState<PlayHistoryEntry[]>([])
  const [nextBefore, setNextBefore] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPlayHistory()
      .then((page) => {
        if (cancelled) return
        setEntries(page.entries)
        setNextBefore(page.nextBefore)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setError("Couldn't load your play history.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function loadMore() {
    if (!nextBefore) return
    setLoadingMore(true)
    setError(null)
    try {
      const page = await fetchPlayHistory(nextBefore)
      setEntries((previous) => [...previous, ...page.entries])
      setNextBefore(page.nextBefore)
    } catch (err) {
      console.error(err)
      setError("Couldn't load more of your play history.")
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <main className="min-h-screen text-ink">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-accent-start bg-linear-to-r from-accent-base-start via-accent-base-middle to-accent-base-end px-6 py-6">
        <div className="flex items-center gap-4">
          <BackButton onClick={() => navigate('/home')} />
          <h1 className="text-3xl font-bold">Play History</h1>
        </div>
        <ProfileButton
          username={profile?.displayName ?? user?.email ?? '…'}
          userAvatar={profile?.avatarUrl ?? '/favicon.svg'}
        />
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-6">
        {loading ? (
          <p>Loading your play history…</p>
        ) : entries.length === 0 && !error ? (
          <div className="flex flex-col items-start gap-3 rounded-xl border-2 border-accent-start p-5">
            <p className="text-muted">You haven&apos;t played any scenarios yet.</p>
            <button
              type="button"
              onClick={() => navigate('/scenario_search')}
              className={`${buttonClass} bg-accent-start`}
            >
              Find a scenario
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((entry) => (
              <HistoryRow
                key={entry.runId}
                entry={entry}
                onOpen={() => navigate(`/scenario_search?scenario=${entry.scenarioId}`)}
                onPlay={() => navigate(`/play/${entry.scenarioId}`)}
              />
            ))}
          </ul>
        )}

        {error && <p role="alert">{error}</p>}

        {nextBefore && (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            className={`${buttonClass} self-center`}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </main>
  )
}

function HistoryRow({
  entry,
  onOpen,
  onPlay,
}: {
  entry: PlayHistoryEntry
  onOpen: () => void
  onPlay: () => void
}) {
  const title = entry.scenarioTitle ?? 'Unavailable scenario'
  const notes = [
    entry.matchId && 'Multiplayer match',
    entry.validation === 'rejected' && 'Not accepted for the leaderboard',
    entry.scenarioAvailable && !entry.isCurrentVersion && 'Scenario updated since this run',
    !entry.scenarioAvailable && 'This scenario was deleted or made private',
  ].filter(Boolean)

  return (
    <li className="flex flex-wrap items-center gap-4 rounded-xl border-3 border-accent-start bg-linear-to-r from-accent-base-start via-accent-base-middle to-accent-base-end px-5 py-3">
      <div className="min-w-0 flex-1">
        {entry.scenarioAvailable ? (
          <button
            type="button"
            onClick={onOpen}
            className="cursor-pointer truncate text-left text-xl font-bold hover:underline"
          >
            {title}
          </button>
        ) : (
          <p className="truncate text-xl font-bold text-muted">{title}</p>
        )}
        <p className="text-sm text-muted">
          <span className="capitalize">{entry.instrument}</span> · {formatPlayedAt(entry.playedAt)}
        </p>
        {notes.map((note) => (
          <p key={String(note)} className="text-xs text-muted">
            {note}
          </p>
        ))}
      </div>

      <div className="text-right">
        <div className="text-2xl font-bold tabular-nums">{entry.finalScore.toLocaleString()}</div>
        <div className="text-xs text-muted">/ {MAX_SCORE.toLocaleString()}</div>
      </div>

      {/* Always the scenario's current version: an older one is never offered for play. */}
      {entry.scenarioAvailable && (
        <button type="button" onClick={onPlay} className={`${buttonClass} bg-accent-start`}>
          {entry.isCurrentVersion ? 'Play again' : 'Play latest'}
        </button>
      )}
    </li>
  )
}
