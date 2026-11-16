/**
 * User story #34: every scenario the signed-in user has played, newest first.
 * An entry opens its scenario's preview on the search page, unless the scenario is gone.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { BackButton } from '@/components/BackButton'
import { ProfileButton } from '@/components/ProfileButton'
import { ScoreTrendsChart } from '@/components/ScoreTrendsChart'
import { useAuth } from '@/lib/auth/useAuth'
import { fetchPlayHistory, type PlayHistoryEntry } from '@/lib/runs/history'
import { HistoryRow } from '@/components/HistoryRow'

const buttonClass =
  'cursor-pointer rounded-lg border-2 border-accent-start px-4 py-2 font-bold active:scale-95 disabled:cursor-not-allowed disabled:opacity-50'

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
          <>
            {/* Only once there is history: a new player has nothing to chart yet. */}
            {entries.length > 0 && <ScoreTrendsChart />}
            <h2 className="text-xl font-bold">Recently played</h2>
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
          </>
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