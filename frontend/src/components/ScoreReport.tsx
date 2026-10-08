import type { ScoreExplanation } from '@/scoring/explain'
import { MAX_SCORE } from '@/scoring/score'

type ScoreReportProps = {
  finalScore: number
  explanation: ScoreExplanation
}

/** The results-screen breakdown of one performance: final score, subscores and note problems. */
export function ScoreReport({ finalScore, explanation }: ScoreReportProps) {
  return (
    <section
      aria-label="Your score"
      className={`
        flex
        w-full
        max-w-xl
        flex-col
        gap-4
        rounded-xl
        border-3
        border-accent-start
        bg-linear-to-br
        from-accent-base-start from-50
        via-accent-base-middle
        to-accent-base-end to-70
        px-5
        py-4
        text-ink
      `}
    >
      <div className="flex items-baseline gap-4">
        <span className="text-5xl font-bold tabular-nums">{finalScore.toLocaleString()}</span>
        <span className="text-muted">/ {MAX_SCORE.toLocaleString()}</span>
      </div>
      <p className="font-semibold">{explanation.summary}</p>

      <div className="grid grid-cols-3 gap-3">
        {explanation.categories.map((category) => (
          <div
            key={category.label}
            className="rounded-lg border-2 border-accent-start bg-base-end/60 p-3"
          >
            <div className="text-xs uppercase tracking-wide text-muted">
              {category.label} · {category.weightPercent}%
            </div>
            <div className="text-2xl font-bold tabular-nums">{category.score}</div>
            <p className="text-xs text-muted">{category.detail}</p>
          </div>
        ))}
      </div>

      {explanation.noteProblems.length > 0 && (
        <div>
          <h3 className="mb-1 font-bold">What to work on</h3>
          <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-sm">
            {explanation.noteProblems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
