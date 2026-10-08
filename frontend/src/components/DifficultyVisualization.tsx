import { useState } from 'react'
import type { DifficultyDetail } from '@/lib/difficulty/types'

const percent = (value: number) => Math.round(value * 100) + '%'

export function DifficultyVisualization({ detail }: { detail: DifficultyDetail }) {
  const estimate = detail.estimate
  const [elo, setElo] = useState(1100)
  const [selectedBand, setSelectedBand] = useState<string | null>(null)
  const active = estimate.bands.find((band) => band.id === selectedBand)
  const expected =
    estimate.targetElo === null
      ? null
      : 1 / (1 + 10 ** ((estimate.targetElo - elo) / estimate.logisticScale))
  const excluded = Object.values(detail.excludedRuns).reduce((sum, count) => sum + count, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="w-full min-w-0 sm:flex-1">
          <p className="text-sm font-bold uppercase tracking-wider text-muted">
            {detail.source === 'synthetic' ? 'Synthetic example' : 'Performance evidence'}
          </p>
          <h2 className="mt-1 wrap-break-word text-2xl font-bold sm:text-3xl">
            {detail.scenario.title}
          </h2>
          <p className="mt-2 max-w-2xl text-muted">{detail.description}</p>
        </div>
        <div className="rounded-2xl border-2 border-accent-start bg-accent-base-start px-5 py-3 text-center">
          <p className="text-lg font-bold">{estimate.label}</p>
          <p className="text-3xl font-bold tabular-nums">
            {estimate.value === null ? '—' : estimate.value.toFixed(1)}
            <span className="text-base text-muted"> / 10</span>
          </p>
          <p className="text-sm capitalize">{estimate.confidence} confidence</p>
        </div>
      </div>

      {estimate.isProvisional && (
        <p role="status" className="rounded-xl border-2 border-contrast-middle bg-base-middle p-4">
          Provisional: {estimate.distinctPlayers} distinct players across{' '}
          {estimate.representedBands} rating bands. At least {estimate.minimumPlayers} players
          across {estimate.minimumBands} bands are needed before publishing an empirical grade.
          {estimate.value !== null && ' The number above is a tentative estimate.'}
        </p>
      )}

      <section aria-labelledby="scores-by-skill">
        <h3 id="scores-by-skill" className="text-xl font-bold">
          How players scored
        </h3>
        <p className="mt-1 text-muted">
          Scores keep their full 0–100% range. Lower scores from similarly rated players indicate a
          harder scenario. Select a rating band to inspect its evidence.
        </p>
        <figure className="mt-4 rounded-2xl border-2 border-base-middle bg-base-start p-4">
          <svg
            viewBox="0 0 640 250"
            role="img"
            aria-label="Average normalized score by player Elo band"
            className="w-full"
            style={{ maxHeight: 310 }}
          >
            <title>Average normalized score by player Elo band</title>
            <desc>
              {estimate.bands
                .map(
                  (band) =>
                    band.label +
                    ': ' +
                    (band.meanScore === null ? 'no evidence' : percent(band.meanScore)) +
                    ', ' +
                    band.players +
                    ' players',
                )
                .join('. ')}
            </desc>
            {[0, 25, 50, 75, 100].map((value) => (
              <g key={value}>
                <line
                  x1="45"
                  x2="625"
                  y1={210 - value * 1.8}
                  y2={210 - value * 1.8}
                  stroke="var(--color-base-middle)"
                  strokeWidth="2"
                />
                <text
                  x="36"
                  y={215 - value * 1.8}
                  textAnchor="end"
                  fontSize="13"
                  fill="var(--color-muted)"
                >
                  {value}%
                </text>
              </g>
            ))}
            {estimate.bands.map((band, index) => {
              const x = 85 + index * 185
              const height = (band.meanScore ?? 0) * 180
              return (
                <g key={band.id}>
                  <rect
                    x={x}
                    y={210 - height}
                    width="100"
                    height={Math.max(height, 2)}
                    rx="8"
                    fill={
                      band.id === selectedBand
                        ? 'var(--color-contrast-middle)'
                        : 'var(--color-accent-middle)'
                    }
                  />
                  <text
                    x={x + 50}
                    y={Math.max(20, 200 - height)}
                    textAnchor="middle"
                    fontSize="17"
                    fontWeight="bold"
                    fill="var(--color-ink)"
                  >
                    {band.meanScore === null ? 'No data' : percent(band.meanScore)}
                  </text>
                  <text
                    x={x + 50}
                    y="238"
                    textAnchor="middle"
                    fontSize="14"
                    fill="var(--color-ink)"
                  >
                    {band.label}
                  </text>
                </g>
              )
            })}
          </svg>
          <figcaption className="mt-3 text-sm text-muted">
            Each player contributes one averaged score. The grade accounts for player Elo and gives
            each represented band equal weight.
          </figcaption>
        </figure>
        <div className="mt-3 grid gap-3 sm:grid-cols-3" aria-label="Rating band details">
          {estimate.bands.map((band) => (
            <button
              key={band.id}
              type="button"
              aria-pressed={selectedBand === band.id}
              onClick={() => setSelectedBand(band.id)}
              className={
                'cursor-pointer rounded-xl border-2 p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-middle ' +
                (selectedBand === band.id
                  ? 'border-contrast-middle bg-base-middle'
                  : 'border-base-middle')
              }
            >
              <span className="block font-bold">{band.label}</span>
              <span className="mt-1 block text-sm text-muted">
                {band.players} players · {band.attempts} counted attempts
              </span>
              <span className="mt-2 block text-xl font-bold">
                {band.meanScore === null
                  ? 'No scores yet'
                  : percent(band.meanScore) + ' average score'}
              </span>
            </button>
          ))}
        </div>
        {active && (
          <p className="mt-3 rounded-xl bg-base-middle p-4" aria-live="polite">
            {active.players === 0
              ? active.label + ' has no evidence yet.'
              : active.label +
                ' contributes ' +
                active.players +
                ' independent players. Their average score is ' +
                percent(active.meanScore ?? 0) +
                ', smoothed to ' +
                percent(active.smoothedScore ?? 0) +
                ' to reduce the influence of a small sample.'}
          </p>
        )}
      </section>

      <section
        className="rounded-2xl border-2 border-base-middle p-5"
        aria-labelledby="rating-illustration"
      >
        <h3 id="rating-illustration" className="text-xl font-bold">
          Explore a player rating
        </h3>
        <label className="mt-3 block font-bold" htmlFor="difficulty-player-elo">
          Player Elo: {elo}
        </label>
        <input
          id="difficulty-player-elo"
          type="range"
          min="0"
          max="2600"
          step="25"
          value={elo}
          onChange={(event) => setElo(Number(event.target.value))}
          className="mt-3 w-full accent-accent-middle"
        />
        <p className="mt-2 text-lg">
          {expected === null
            ? 'More evidence is needed to illustrate this scenario.'
            : 'Illustrative score at this rating: ' + percent(expected)}
        </p>
        <p className="mt-1 text-sm text-muted">
          This curve explains the estimate; it is not a validated prediction of your performance.
        </p>
      </section>

      <section aria-labelledby="difficulty-confidence" className="space-y-3">
        <h3 id="difficulty-confidence" className="text-xl font-bold">
          Why this confidence?
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-base-middle p-4">
            <strong className="block text-2xl">{estimate.distinctPlayers}</strong>Distinct players
          </div>
          <div className="rounded-xl bg-base-middle p-4">
            <strong className="block text-2xl">{estimate.representedBands} / 3</strong>Rating bands
            represented
          </div>
          <div className="rounded-xl bg-base-middle p-4">
            <strong className="block text-2xl">{estimate.effectiveAttempts}</strong>Counted attempts
          </div>
        </div>
        <p className="text-muted">
          The latest {estimate.attemptsPerPlayer} attempts per player are averaged. More attempts
          from one player do not count as more independent players. High confidence needs at least{' '}
          {estimate.highConfidencePlayers} players and all three rating bands.
        </p>
        {estimate.cappedAttempts > 0 && (
          <p>{estimate.cappedAttempts} repeat attempts excluded by the per-player cap.</p>
        )}
        {excluded + estimate.invalidObservations + estimate.duplicateObservations > 0 && (
          <p>
            {excluded + estimate.invalidObservations + estimate.duplicateObservations} ineligible,
            malformed or duplicate observations excluded.
          </p>
        )}
        <details className="rounded-xl border-2 border-base-middle p-4">
          <summary className="cursor-pointer font-bold">How the estimate is calculated</summary>
          <p className="mt-3 text-sm text-muted">
            Each band combines average Elo with its smoothed normalized score to estimate a
            challenge rating. Those ratings are averaged equally across represented bands and mapped
            onto the existing 1–10 difficulty scale. {estimate.smoothingPlayers} neutral player
            equivalents per band provide smoothing. Easy is below 4, Medium is 4–6.99, and Hard
            starts at 7.
          </p>
          <p className="mt-2 text-sm text-muted">
            The scale is a provisional calibration; confidence describes sample coverage, not a
            statistical certainty.
          </p>
        </details>
      </section>
    </div>
  )
}
