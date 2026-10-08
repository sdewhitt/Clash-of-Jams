import type { RatingEvent } from '@/lib/schema/types'

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** Shared rating breakdown for history and the upcoming multiplayer result screen. */
export function RatingResult({ event }: { event: RatingEvent }) {
  const outcome =
    event.outcome === 'forfeit'
      ? 'Forfeit'
      : event.outcome.charAt(0).toUpperCase() + event.outcome.slice(1)
  const delta = (event.eloDelta > 0 ? '+' : '') + number.format(event.eloDelta)
  return (
    <article className="rounded-xl border-3 border-accent-start bg-accent-base-start p-5 text-ink">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xl font-bold">{outcome}</h3>
        <span className="text-sm text-muted">{event.appliedAt.toDate().toLocaleString()}</span>
      </div>
      <p className="mt-3 text-3xl font-bold" aria-label="Rating change">
        {number.format(event.eloBefore)} <span aria-hidden="true">→</span>{' '}
        {number.format(event.eloAfter)} <span className="text-xl">({delta})</span>
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <div>
          <dt className="text-sm text-muted">Your score</dt>
          <dd>{number.format(event.score * 100)}%</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Opponent score</dt>
          <dd>{number.format(event.opponentScore * 100)}%</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Expected result</dt>
          <dd>{number.format(event.expectedScore * 100)}%</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">K-factor</dt>
          <dd>{event.kFactor}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-muted">
        {event.reason === 'resigned'
          ? 'Decided by resignation. '
          : event.reason === 'disconnected'
            ? 'Decided by disconnect forfeit. '
            : ''}
        {event.gamesPlayedAfter} rated matches ·{' '}
        {event.isProvisional ? 'Provisional' : 'Established'}
      </p>
    </article>
  )
}
