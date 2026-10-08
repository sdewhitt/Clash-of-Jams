import { useState } from 'react'
import { useNavigate } from 'react-router'

import { BackButton } from '@/components/BackButton'
import { EloDisplay } from '@/components/EloDisplay'
import { ProfileButton } from '@/components/ProfileButton'
import { RatingResult } from '@/components/RatingResult'
import { useAuth } from '@/lib/auth/useAuth'
import { useRatingHistory } from '@/lib/ratings/useRatingHistory'
import { useSkillRatings } from '@/lib/ratings/useSkillRatings'
import { INSTRUMENTS, type Instrument } from '@/lib/schema/types'

export function RatingHistory() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { ratings, preferredInstrument, loading, error } = useSkillRatings(user?.uid)
  const [selected, setSelected] = useState<Instrument | null>(null)
  const instrument = selected ?? preferredInstrument
  const history = useRatingHistory(user?.uid, instrument)
  const rating = ratings.find((item) => item.instrument === instrument)

  return (
    <main className="min-h-screen text-ink">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-accent-start bg-linear-to-r from-accent-base-start via-accent-base-middle to-accent-base-end px-6 py-6">
        <div className="flex items-center gap-4">
          <BackButton onClick={() => navigate('/home')} />
          <h1 className="text-3xl font-bold">Your Elo</h1>
        </div>
        <ProfileButton
          username={profile?.displayName ?? user?.email ?? '…'}
          userAvatar={profile?.avatarUrl ?? '/favicon.svg'}
        />
      </header>
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-6">
        <section
          aria-labelledby="instrument-rating-title"
          className="rounded-xl border-3 border-accent-start bg-accent-base-start p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="instrument-rating-title" className="text-xl font-bold">
              Instrument rating
            </h2>
            <select
              value={instrument}
              onChange={(event) => setSelected(event.target.value as Instrument)}
              aria-label="Instrument"
              className="rounded-lg border-2 border-accent-start bg-accent-base-middle px-3 py-2 capitalize"
            >
              {INSTRUMENTS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <p className="mt-4">Loading rating…</p>
          ) : error ? (
            <p role="alert" className="mt-4">
              {error}
            </p>
          ) : rating ? (
            <div className="mt-4 flex flex-wrap items-center gap-4">
              <EloDisplay instrument={instrument} tier={rating.tier} elo={rating.elo} />
              <p>
                {rating.gamesPlayed} rated matches ·{' '}
                {rating.isProvisional ? 'Provisional' : 'Established'}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-muted">No rating for this instrument yet.</p>
          )}
          <p className="mt-4 text-sm text-muted">
            Wins, losses and draws change your Elo based on opponent strength. Provisional means
            fewer than 10 rated matches; it does not change the K-factor.
          </p>
        </section>
        <h2 className="text-xl font-bold">Recent matches</h2>
        {history.loading ? (
          <p>Loading history…</p>
        ) : history.error ? (
          <p role="alert">{history.error}</p>
        ) : history.events.length === 0 ? (
          <p className="rounded-xl border-2 border-accent-start p-5 text-muted">
            No rated matches yet. Your match results will appear here.
          </p>
        ) : (
          history.events.map((event) => <RatingResult key={event.matchId} event={event} />)
        )}
      </div>
    </main>
  )
}
