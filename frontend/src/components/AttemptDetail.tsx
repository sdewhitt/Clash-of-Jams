import type { ScenarioAttempt } from "@/lib/runs/history"
import { MAX_SCORE } from "@/scoring/score"

function formatPercent(value: number): string {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
}

function Count({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
            <dd className="font-semibold tabular-nums text-ink">{children}</dd>
        </div>
    )
}

type AttemptDetailProps = {
    attempt: ScenarioAttempt
    onBack: () => void
}

export function AttemptDetail({ attempt, onBack }: AttemptDetailProps) {
    const { breakdown } = attempt
    const subscores = [
        { label: "Pitch", value: breakdown.pitchAccuracy },
        { label: "Rhythm", value: breakdown.rhythmAccuracy },
        { label: "Completeness", value: breakdown.completeness },
    ]

    return (
        <section aria-label="Attempt details" className="flex flex-col gap-3 text-ink">
            <button
                type="button"
                onClick={onBack}
                className="self-start text-sm font-semibold text-muted hover:text-ink"
            >
                ← All attempts
            </button>

            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                    <span className="text-3xl font-bold tabular-nums">
                        {attempt.finalScore.toLocaleString()}
                    </span>
                    <span className="ml-2 text-sm text-muted">/ {MAX_SCORE.toLocaleString()}</span>
                </div>
                <p className="text-sm text-muted">
                    <span className="capitalize">{attempt.instrument}</span> ·{" "}
                    {new Date(attempt.playedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                    })}
                </p>
            </div>

            {attempt.validation === "rejected" && (
                <p className="text-sm text-muted">
                    This attempt wasn&apos;t accepted, so it doesn&apos;t count toward your stats.
                </p>
            )}

            <div className="grid grid-cols-3 gap-3">
                {subscores.map(({ label, value }) => (
                    <div key={label} className="rounded-lg border-2 border-accent-start bg-white/10 p-3">
                        <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
                        <div className="text-2xl font-bold tabular-nums">{formatPercent(value)}</div>
                        {/* Subscores are percentages, so the bar's width is the value itself. */}
                        <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-full bg-white/30">
                            <div className="h-full bg-accent-start" style={{ width: `${value}%` }} />
                        </div>
                    </div>
                ))}
            </div>

            <dl className="grid grid-cols-3 gap-2 text-center text-sm">
                <Count label="Notes hit">{breakdown.notesHit}</Count>
                <Count label="Notes missed">{breakdown.notesMissed}</Count>
                <Count label="Extra notes">{breakdown.extraNotes}</Count>
            </dl>
        </section>
    )
}