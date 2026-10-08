import { Link } from 'react-router'

import { EloDisplay } from '@/components/EloDisplay'
import { useAuth } from '@/lib/auth/useAuth'
import { useSkillRatings } from '@/lib/ratings/useSkillRatings'

export function LiveElo() {
  const { user } = useAuth()
  const { ratings, preferredInstrument, loading, error } = useSkillRatings(user?.uid)
  if (!user) return null
  const rating = ratings.find((item) => item.instrument === preferredInstrument)
  return (
    <Link
      to="/ratings"
      aria-label={'View ' + preferredInstrument + ' Elo and rating history'}
      className="shrink-0 whitespace-nowrap rounded-lg focus-visible:outline-3 focus-visible:outline-white"
      title={error ?? 'View your rating history'}
    >
      <div aria-live="polite" aria-atomic="true">
        {loading ? (
          <span className="text-sm text-muted">Loading Elo…</span>
        ) : rating ? (
          <EloDisplay instrument={rating.instrument} tier={rating.tier} elo={rating.elo} />
        ) : (
          <span className="text-sm text-muted">{error ? 'Elo unavailable' : 'No rating yet'}</span>
        )}
      </div>
    </Link>
  )
}
